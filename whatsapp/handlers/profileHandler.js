// 📁 whatsapp/handlers/profileHandler.js
const { getUserRef } = require('../../utils/userUtils'); 
const admin = require('firebase-admin');

const RANKS = [
    { name: 'בוט מתחיל', min: 0, reward: 0 },
    { name: 'טירון', min: 50, reward: 150 },
    { name: 'לוחם', min: 200, reward: 400 },
    { name: 'מתנקש', min: 600, reward: 1000 },
    { name: 'קומנדו', min: 1200, reward: 2500 },
    { name: 'אגדה', min: 2500, reward: 5000 }
];

async function incrementTotalMessages(senderId, senderName) {
    try {
        const userRef = await getUserRef(senderId, 'whatsapp');
        
        const result = await userRef.firestore.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            if (!doc.exists) return null;

            const data = doc.data();
            const currentMsgs = (data.stats?.messagesSent || 0) + 1;
            
            t.set(userRef, { 
                stats: { messagesSent: currentMsgs },
                identity: { displayName: senderName },
                meta: { lastActive: new Date().toISOString() }
            }, { merge: true });

            const newRank = RANKS.find(r => r.min === currentMsgs);
            if (newRank && newRank.min > 0) {
                t.update(userRef, { 
                    'economy.balance': admin.firestore.FieldValue.increment(newRank.reward) 
                });
                return { leveledUp: true, rankName: newRank.name, reward: newRank.reward, totalMessages: currentMsgs };
            }
            return { leveledUp: false };
        });
        
        return result;
    } catch (e) { 
        console.error('Profile Increment Error:', e);
        return null; 
    }
}

// הוספת עובדה ל-Brain ב-DB המאוחד
async function addFact(senderId, fact) {
    try {
        const userRef = await getUserRef(senderId, 'whatsapp');
        await userRef.update({
            'brain.facts': admin.firestore.FieldValue.arrayUnion({
                content: fact,
                date: new Date().toISOString(),
                source: 'whatsapp_manual'
            })
        });
        return true;
    } catch (e) {
        return false;
    }
}

// שליפת נתונים לכרטיס פרופיל (מתוך המאסטר רקורד)
async function getUserFullProfile(senderId, senderName) {
    const userRef = await getUserRef(senderId, 'whatsapp');
    const doc = await userRef.get();
    
    if (!doc.exists) {
        return { whatsappData: { totalMessages: 0, xp: 0 }, discordData: { xp: 0 } };
    }
    
    const data = doc.data();
    return {
        whatsappData: { 
            totalMessages: data.stats?.messagesSent || 0,
            xp: data.economy?.balance || 0 
        },
        discordData: { 
            xp: data.economy?.balance || 0 
        }
    };
}

module.exports = { incrementTotalMessages, addFact, getUserFullProfile };