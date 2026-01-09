// 📁 handlers/users/stats.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

class StatsHandler {
    
    /**
     * עדכון סטטיסטיקות משחק בצורה בטוחה
     * @param {string} userId - ה-ID של המשתמש בדיסקורד
     * @param {string} gameName - שם המשחק (כפי שמגיע מדיסקורד)
     * @param {number} addedMinutes - כמה דקות להוסיף (0 אם זה רק עדכון "נראה לאחרונה")
     */
    async updateGameStats(userId, gameName, addedMinutes = 0) {
        if (!userId || !gameName) return;

        // ניקוי שם המשחק מתווים שיכולים לשבור נתיבים (למרות שאנחנו משתמשים באובייקטים, זה הרגל טוב)
        // בפיירבייס מותר הכל חוץ מ / בתוך מפתח, אבל נהיה בטוחים
        const cleanGameName = gameName.replace(/\//g, '-'); 

        const userRef = db.collection('gameStats').doc(userId);
        const now = new Date().toISOString();

        try {
            // טרנזקציה מבטיחה שלא נאבד דקות אם יש שני עדכונים במקביל
            await db.runTransaction(async (t) => {
                const doc = await t.get(userRef);
                const data = doc.exists ? doc.data() : {};
                
                // שליפת הנתונים הקיימים למשחק הזה
                const existingGameData = data[cleanGameName] || { minutes: 0, lastPlayed: now };
                
                // חישובים
                const newMinutes = (existingGameData.minutes || 0) + addedMinutes;
                
                // בניית האובייקט לעדכון
                // שים לב: אנחנו לא בונים מפתח עם נקודה!
                // אנחנו מעדכנים את האובייקט השלם של המשחק
                const gameUpdate = {
                    minutes: newMinutes,
                    lastPlayed: now
                };

                // שימוש ב-merge כדי לא לדרוס משחקים אחרים
                t.set(userRef, { 
                    [cleanGameName]: gameUpdate 
                }, { merge: true });
            });

        } catch (error) {
            log(`❌ [GameStats] Error updating ${cleanGameName} for ${userId}: ${error.message}`);
        }
    }

    /**
     * שליפת כל הסטטיסטיקות למשתמש
     */
    async getUserStats(userId) {
        try {
            const doc = await db.collection('gameStats').doc(userId).get();
            if (!doc.exists) return null;
            return doc.data();
        } catch (error) {
            console.error('Error fetching game stats:', error);
            return null;
        }
    }
}

module.exports = new StatsHandler();