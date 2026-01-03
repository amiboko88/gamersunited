// 📁 whatsapp/handlers/profileHandler.js
const { getUserRef } = require('../../utils/userUtils'); // ✅
const admin = require('firebase-admin');

// דרגות בוואטסאפ (אפשר לשמור את זה אם זה שונה מהדיסקורד, או לאחד בעתיד)
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
            if (!doc.exists) return; // או ליצור

            const data = doc.data();
            const currentMsgs = (data.stats?.messagesSent || 0) + 1;
            
            // עדכון הודעות
            t.update(userRef, { 
                'stats.messagesSent': currentMsgs,
                'identity.displayName': senderName // עדכון שם על הדרך
            });

            // בדיקת עליית דרגה (לפי כמות הודעות)
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
        console.error('Profile Increment Error:', e);
        return null; 
    }
}

module.exports = { incrementTotalMessages };