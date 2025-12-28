const db = require('../../utils/firebase');
const admin = require('firebase-admin');
const { log } = require('../../utils/logger');

let activeSession = {
    isActive: false,
    startTime: 0,
    players: [], 
    bets: []
};

function startCasinoSession(playerNames) {
    if (activeSession.isActive) return false; 
    
    activeSession = {
        isActive: true,
        startTime: Date.now(),
        players: playerNames,
        bets: []
    };
    log(`[Casino] 🎰 Session started with: ${playerNames.join(', ')}`);
    return true;
}

function endCasinoSession() {
    activeSession.isActive = false;
    activeSession.bets = [];
    activeSession.players = [];
    log(`[Casino] 🛑 Session ended.`);
}

async function placeBet(senderId, senderName, text) {
    if (!activeSession.isActive) {
        return "הקזינו סגור כרגע נשמה. שמור את השקלים.";
    }

    const match = text.match(/שים\s+(\d+)\s+על\s+(.+)/);
    if (!match) return null; 

    const amount = parseInt(match[1]);
    const target = match[2].trim();
    
    if (amount <= 0) return "מה זה? תביא כסף אמיתי או שתעוף מפה.";

    const userRef = db.collection('whatsapp_users').doc(senderId);
    const userDoc = await userRef.get();
    
    let currentXP = 0;
    let discordId = null;

    if (userDoc.exists) {
        discordId = userDoc.data().discordId;
        if (discordId) {
            const discordUser = await db.collection('users').doc(discordId).get();
            if (discordUser.exists) currentXP = discordUser.data().xp || 0;
        }
    }

    // ✅ שינוי לסימן שקל
    if (currentXP < amount) {
        return `בואנה יא תפרן, מאיפה תביא כסף? יש לך בבנק רק ₪${currentXP}.`;
    }

    activeSession.bets.push({
        betterId: senderId,
        betterName: senderName,
        target: target,
        amount: amount,
        discordId: discordId 
    });

    return `רשמתי. שם ₪${amount} על ${target}. בהצלחה.`;
}

async function resolveBets(winnerName) {
    if (!activeSession.isActive || activeSession.bets.length === 0) return null;

    let report = "💰 **תוצאות ההימורים:**\n";
    let winnersCount = 0;

    for (const bet of activeSession.bets) {
        if (winnerName.toLowerCase().includes(bet.target.toLowerCase()) || 
            bet.target.toLowerCase().includes(winnerName.toLowerCase())) {
            
            const winAmount = bet.amount * 2;
            // ✅ שינוי לסימן שקל
            report += `✅ ${bet.betterName} הימר על ${bet.target} ולקח ₪${winAmount}!\n`;
            
            if (bet.discordId) {
                await db.collection('users').doc(bet.discordId).update({
                    xp: admin.firestore.FieldValue.increment(winAmount)
                });
            }
            winnersCount++;
        } else {
            // ✅ שינוי לסימן שקל
            report += `❌ ${bet.betterName} הפסיד ₪${bet.amount} (הימר על ${bet.target}).\n`;
             if (bet.discordId) {
                await db.collection('users').doc(bet.discordId).update({
                    xp: admin.firestore.FieldValue.increment(-bet.amount)
                });
            }
        }
    }

    if (winnersCount === 0) report += "הלך הכסף. הבית תמיד מרוויח. 💸";
    
    activeSession.bets = []; 
    return report;
}

function isSessionActive() { return activeSession.isActive; }
function getActivePlayers() { return activeSession.players; }

module.exports = { startCasinoSession, endCasinoSession, placeBet, resolveBets, isSessionActive, getActivePlayers };