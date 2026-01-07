// 📁 handlers/users/ranking.js
const admin = require('firebase-admin');
const { getUserRef } = require('../../utils/userUtils');

const RANKS = [
    { name: 'בוט מתחיל', min: 0, reward: 0 },
    { name: 'טירון', min: 50, reward: 150 },
    { name: 'לוחם', min: 200, reward: 400 },
    { name: 'מתנקש', min: 600, reward: 1000 },
    { name: 'קומנדו', min: 1200, reward: 2500 },
    { name: 'אגדה', min: 2500, reward: 5000 }
];

async function addXpAndCheckRank(userId, platform, userName) {
    try {
        const userRef = await getUserRef(userId, platform);
        
        const result = await userRef.firestore.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            if (!doc.exists) {
                // יצירת משתמש אם לא קיים
                t.set(userRef, { 
                    identity: { displayName: userName },
                    stats: { messagesSent: 1 },
                    meta: { lastActive: new Date().toISOString() }
                }, { merge: true });
                return { leveledUp: false };
            }

            const data = doc.data();
            const currentMsgs = (data.stats?.messagesSent || 0) + 1;
            
            // עדכון מונה הודעות וזמן פעילות
            t.set(userRef, { 
                stats: { messagesSent: currentMsgs },
                identity: { displayName: userName }, // עדכון שם למקרה שהשתנה
                meta: { lastActive: new Date().toISOString() }
            }, { merge: true });

            // בדיקת עליית דרגה
            const newRank = RANKS.find(r => r.min === currentMsgs);
            if (newRank && newRank.min > 0) {
                // מתן פרס כספי
                t.update(userRef, { 
                    'economy.balance': admin.firestore.FieldValue.increment(newRank.reward) 
                });
                return { leveledUp: true, rankName: newRank.name, reward: newRank.reward };
            }
            return { leveledUp: false };
        });
        
        return result;
    } catch (e) { 
        console.error('Ranking Error:', e);
        return null; 
    }
}

module.exports = { addXpAndCheckRank };