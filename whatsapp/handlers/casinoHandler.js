const db = require('../../utils/firebase');
const admin = require('firebase-admin');
const { log } = require('../../utils/logger');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let activeSession = {
    isActive: false,
    startTime: 0,
    players: [], 
    bets: []
};

let sessionTimer = null; // טיימר לסגירה אוטומטית

// ניתוח הימור באמצעות AI
async function parseBetWithAI(text) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `
                    אתה מנתח הימורים. קלט: משפט. פלט: JSON { "amount": number, "target": string, "isValid": boolean }.
                    חוקים:
                    1. זיהוי סכום: תמוך במספרים וסלנג ("מאייה"=100, "אלפייה"=1000).
                    2. זיהוי יעד: על מי מהמרים.
                    3. isValid: האם זה הימור אמיתי?
                    ` 
                },
                { role: "user", content: text }
            ],
            temperature: 0,
            response_format: { type: "json_object" }
        });

        return JSON.parse(completion.choices[0].message.content);
    } catch (e) {
        console.error("AI Bet Error:", e);
        return { isValid: false };
    }
}

// ניהול טיימר סגירה אוטומטית (30 דקות)
function resetAutoCloseTimer() {
    if (sessionTimer) clearTimeout(sessionTimer);
    
    sessionTimer = setTimeout(() => {
        if (activeSession.isActive) {
            endCasinoSession();
            log('[Casino] ⏳ Auto-closed due to inactivity.');
            // כאן אי אפשר לשלוח הודעה כי אין לנו את ה-sock, אבל הבוט יפסיק לקבל הימורים
        }
    }, 30 * 60 * 1000);
}

function startCasinoSession(playerNames) {
    if (activeSession.isActive) return false; 
    
    activeSession = { 
        isActive: true, 
        startTime: Date.now(), 
        players: playerNames, 
        bets: [] 
    };
    
    resetAutoCloseTimer(); // התחלת טיימר
    log(`[Casino] 🎰 Session started.`);
    return true;
}

function endCasinoSession() {
    activeSession.isActive = false;
    activeSession.bets = [];
    activeSession.players = [];
    if (sessionTimer) clearTimeout(sessionTimer);
    log(`[Casino] 🛑 Session ended.`);
}

async function placeBet(senderId, senderName, text) {
    // אם הסשן סגור
    if (!activeSession.isActive) {
        // מגיב רק אם ממש מנסים להמר
        if (text.includes('שים') || text.includes('שם') || text.includes('הימור')) {
            return "הקזינו סגור. חפש חיים.";
        }
        return null;
    }

    resetAutoCloseTimer(); // כל פעילות מאפסת את הטיימר

    const betData = await parseBetWithAI(text);
    if (!betData.isValid || !betData.amount || !betData.target) return null;

    const amount = betData.amount;
    const target = betData.target;
    if (amount <= 0) return "תביא כסף אמיתי.";

    // בדיקת יתרה
    const userRef = db.collection('whatsapp_users').doc(senderId);
    const userDoc = await userRef.get();
    
    let currentXP = 0;
    let discordId = null;

    if (userDoc.exists) {
        const data = userDoc.data();
        discordId = data.discordId;
        
        // מנסה למשוך יתרה עדכנית מהיוזר הראשי (דיסקורד)
        if (discordId) {
            const discordUser = await db.collection('users').doc(discordId).get();
            if (discordUser.exists) currentXP = discordUser.data().xp || 0;
        } else {
            // אם אין דיסקורד, משתמש ב-XP מקומי (גיבוי)
            currentXP = data.xp || 0;
        }
    }

    // 🔥 פיצ'ר השוק האפור (הלוואה אוטומטית)
    if (currentXP <= 0) {
        const LOAN_AMOUNT = 100;
        
        // עדכון הלוואה בדאטה בייס
        if (discordId) {
            await db.collection('users').doc(discordId).update({
                xp: admin.firestore.FieldValue.increment(LOAN_AMOUNT)
            });
        } else {
            await userRef.set({ xp: LOAN_AMOUNT }, { merge: true });
        }

        return `⚠️ ${senderName}, אתה מרושש (0 ש"ח). קיבלת הלוואה של ${LOAN_AMOUNT} ש"ח מהקרן לנזקקים. אל תפסיד את זה יא גרוע.`;
    }

    if (currentXP < amount) return `אין לך כסף יא תפרן. יש לך רק ₪${currentXP}.`;

    activeSession.bets.push({
        betterId: senderId,
        betterName: senderName,
        target: target,
        amount: amount,
        discordId: discordId 
    });

    return `רשמתי. ₪${amount} על ${target}. בהצלחה.`;
}

async function resolveBets(winnerName) {
    if (!activeSession.isActive || activeSession.bets.length === 0) return null;

    let report = "💰 **תוצאות ההימורים:**\n";
    let winnersCount = 0;

    for (const bet of activeSession.bets) {
        // בדיקה גמישה לשם המנצח
        if (winnerName.toLowerCase().includes(bet.target.toLowerCase()) || 
            bet.target.toLowerCase().includes(winnerName.toLowerCase())) {
            
            const winAmount = bet.amount * 2;
            report += `✅ ${bet.betterName} לקח ₪${winAmount}! (הימר על ${bet.target})\n`;
            
            if (bet.discordId) {
                await db.collection('users').doc(bet.discordId).update({
                    xp: admin.firestore.FieldValue.increment(winAmount)
                });
            } else {
                 // עדכון ליוזר וואטסאפ מקומי
                 await db.collection('whatsapp_users').doc(bet.betterId).update({
                    xp: admin.firestore.FieldValue.increment(winAmount)
                });
            }
            winnersCount++;
        } else {
            report += `❌ ${bet.betterName} הפסיד ₪${bet.amount}.\n`;
             if (bet.discordId) {
                await db.collection('users').doc(bet.discordId).update({
                    xp: admin.firestore.FieldValue.increment(-bet.amount)
                });
            } else {
                await db.collection('whatsapp_users').doc(bet.betterId).update({
                    xp: admin.firestore.FieldValue.increment(-bet.amount)
                });
            }
        }
    }

    if (winnersCount === 0) report += "הבית לקח הכל. 💸";
    
    // סגירת סשן בסיום סיבוב
    endCasinoSession(); 
    return report;
}

function isSessionActive() { return activeSession.isActive; }
function getActivePlayers() { return activeSession.players; }

module.exports = { 
    startCasinoSession, 
    endCasinoSession, 
    placeBet, 
    resolveBets, 
    isSessionActive, 
    getActivePlayers 
};