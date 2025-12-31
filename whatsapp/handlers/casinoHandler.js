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

let sessionTimer = null; 

/**
 * מנגנון AI שמייצר ירידה דינמית למכורים שמנסים להמר כשהקזינו סגור
 */
async function generateClosedRoast(senderName, text) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `
                    אתה שמעון, מנהל קזינו בקבוצת גיימרים. הקזינו כרגע סגור.
                    המשתמש ${senderName} ניסה להמר (כתב: "${text}").
                    המשימה שלך: תן לו ירידה קצרה (עד 8 מילים).
                    תרד עליו שהוא מכור, שהוא צריך גמילה, או שתגיד לו לחזור לישון.
                    בלי "שלום" ובלי נימוסים. סלנג ישראלי.
                    ` 
                }
            ],
            temperature: 0.9,
            max_tokens: 50
        });
        return completion.choices[0].message.content;
    } catch (e) {
        return "הקזינו סגור יא מכור. לך לישון."; // גיבוי למקרה קיצון
    }
}

// ניתוח הימור באמצעות AI (עובד כשהקזינו פתוח)
async function parseBetWithAI(text) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { 
                    role: "system", 
                    content: `
                    אתה מנתח הימורים. קלט: משפט. פלט: JSON בלבד.
                    { "amount": number, "target": string, "isValid": boolean }
                    
                    חוקים:
                    1. זיהוי סכום: תמוך במספרים וסלנג ("מאייה"=100, "אלפייה"=1000, "חצי"=50).
                    2. זיהוי יעד: על מי מהמרים (שם של אדם או "הבית").
                    3. isValid: האם זה נראה כמו ניסיון הימור?
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

function resetAutoCloseTimer() {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
        if (activeSession.isActive) {
            endCasinoSession();
            log('[Casino] ⏳ Auto-closed due to inactivity.');
        }
    }, 30 * 60 * 1000); // 30 דקות
}

function startCasinoSession(playerNames) {
    if (activeSession.isActive) return false; 
    activeSession = { 
        isActive: true, 
        startTime: Date.now(), 
        players: playerNames, 
        bets: [] 
    };
    resetAutoCloseTimer();
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

/**
 * הפונקציה הראשית לטיפול בהימור
 */
async function placeBet(senderId, senderName, text) {
    // 1. אם הקזינו סגור - מפעילים AI לטיפול במכורים
    if (!activeSession.isActive) {
        // אנחנו כבר לא בודקים מילים ספציפיות כאן.
        // ההנחה היא שאם הגענו לפה, logic.js זיהה כוונה כללית.
        // אנחנו ניתן ל-AI להחליט איך להגיב.
        const roast = await generateClosedRoast(senderName, text);
        return roast;
    }

    resetAutoCloseTimer(); 

    // 2. פענוח ההימור (כשהקזינו פתוח)
    const betData = await parseBetWithAI(text);
    
    // אם ה-AI לא הצליח להבין שזה הימור תקין - מתעלמים
    if (!betData.isValid || !betData.amount || !betData.target) return null;

    const amount = betData.amount;
    const target = betData.target;
    if (amount <= 0) return "תביא כסף אמיתי.";

    // 3. בדיקת יתרה
    const userRef = db.collection('whatsapp_users').doc(senderId);
    const userDoc = await userRef.get();
    
    let currentXP = 0;
    let discordId = null;

    if (userDoc.exists) {
        const data = userDoc.data();
        discordId = data.discordId;
        if (discordId) {
            const discordUser = await db.collection('users').doc(discordId).get();
            if (discordUser.exists) currentXP = discordUser.data().xp || 0;
        } else {
            currentXP = data.xp || 0;
        }
    }

    // 4. שוק אפור (הלוואות)
    if (currentXP <= 0) {
        const LOAN_AMOUNT = 100;
        if (discordId) {
            await db.collection('users').doc(discordId).update({ xp: admin.firestore.FieldValue.increment(LOAN_AMOUNT) });
        } else {
            await userRef.set({ xp: LOAN_AMOUNT }, { merge: true });
        }
        return `⚠️ ${senderName}, אתה מרושש (0 ש"ח). קיבלת הלוואה של ${LOAN_AMOUNT} ש"ח מהקרן לנזקקים. אל תפסיד את זה יא גרוע.`;
    }

    if (currentXP < amount) return `אין לך כסף יא תפרן. יש לך רק ₪${currentXP}.`;

    // 5. רישום ההימור
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
        if (winnerName.toLowerCase().includes(bet.target.toLowerCase()) || 
            bet.target.toLowerCase().includes(winnerName.toLowerCase())) {
            
            const winAmount = bet.amount * 2;
            report += `✅ ${bet.betterName} לקח ₪${winAmount}! (הימר על ${bet.target})\n`;
            
            if (bet.discordId) {
                await db.collection('users').doc(bet.discordId).update({ xp: admin.firestore.FieldValue.increment(winAmount) });
            } else {
                 await db.collection('whatsapp_users').doc(bet.betterId).update({ xp: admin.firestore.FieldValue.increment(winAmount) });
            }
            winnersCount++;
        } else {
            report += `❌ ${bet.betterName} הפסיד ₪${bet.amount}.\n`;
             if (bet.discordId) {
                await db.collection('users').doc(bet.discordId).update({ xp: admin.firestore.FieldValue.increment(-bet.amount) });
            } else {
                await db.collection('whatsapp_users').doc(bet.betterId).update({ xp: admin.firestore.FieldValue.increment(-bet.amount) });
            }
        }
    }

    if (winnersCount === 0) report += "הבית לקח הכל. 💸";
    endCasinoSession(); 
    return report;
}

function isSessionActive() { return activeSession.isActive; }
function getActivePlayers() { return activeSession.players; }

module.exports = { startCasinoSession, endCasinoSession, placeBet, resolveBets, isSessionActive, getActivePlayers };