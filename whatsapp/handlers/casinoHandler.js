const db = require('../../utils/firebase');
const admin = require('firebase-admin');
const { log } = require('../../utils/logger');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let activeSession = { isActive: false, startTime: 0, players: [], bets: [] };
let sessionTimer = null;

// AI לפענוח (נשאר פנימי כי זה כלי עזר)
async function parseBetWithAI(text) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `נתח הימור. החזר JSON: { "amount": number, "target": string, "isValid": boolean }. סלנג: מאייה=100, אלפייה=1000.` },
                { role: "user", content: text }
            ],
            response_format: { type: "json_object" }
        });
        return JSON.parse(completion.choices[0].message.content);
    } catch (e) { return { isValid: false }; }
}

function resetAutoCloseTimer() {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
        if (activeSession.isActive) {
            activeSession.isActive = false; // סגירה שקטה, הלוגיקה תטפל בהודעה אם צריך
            log('[Casino] ⏳ Auto-closed.');
        }
    }, 30 * 60 * 1000);
}

function startCasinoSession() {
    if (activeSession.isActive) return false;
    activeSession = { isActive: true, startTime: Date.now(), players: [], bets: [] };
    resetAutoCloseTimer();
    return true;
}

function endCasinoSession() {
    activeSession.isActive = false;
    activeSession.bets = [];
    if (sessionTimer) clearTimeout(sessionTimer);
}

// 🔥 השינוי הגדול: מחזיר אובייקט נתונים ולא טקסט
async function placeBet(senderId, senderName, text) {
    if (!activeSession.isActive) return { status: 'closed' };

    resetAutoCloseTimer();

    const betData = await parseBetWithAI(text);
    if (!betData.isValid || !betData.amount || !betData.target) return { status: 'invalid' };

    const amount = betData.amount;
    const target = betData.target;

    // בדיקת יתרה
    const userRef = db.collection('whatsapp_users').doc(senderId);
    const userDoc = await userRef.get();
    let currentXP = 0;
    let discordId = null;

    if (userDoc.exists) {
        const data = userDoc.data();
        discordId = data.discordId;
        if (discordId) {
            const discordUser = await db.collection('users').doc(discordId).get();
            currentXP = discordUser.exists ? (discordUser.data().xp || 0) : 0;
        } else {
            currentXP = data.xp || 0;
        }
    }

    // הלוואה (שוק אפור)
    if (currentXP <= 0) {
        const LOAN = 100;
        if (discordId) await db.collection('users').doc(discordId).update({ xp: admin.firestore.FieldValue.increment(LOAN) });
        else await userRef.set({ xp: LOAN }, { merge: true });
        
        return { status: 'broke', loanAmount: LOAN };
    }

    if (currentXP < amount) return { status: 'insufficient_funds', currentBalance: currentXP };

    // ביצוע ההימור
    activeSession.bets.push({ betterId: senderId, betterName: senderName, target, amount, discordId });
    
    return { 
        status: 'success', 
        amount: amount, 
        target: target, 
        newBalance: currentXP - amount // יתרה תיאורטית (הכסף יורד רק בהפסד בפועל, אבל לרוב מורידים מראש. נשאיר את הלוגיקה שלך)
    };
}

function isSessionActive() { return activeSession.isActive; }

module.exports = { startCasinoSession, endCasinoSession, placeBet, isSessionActive };