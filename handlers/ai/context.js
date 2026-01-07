// 📁 handlers/ai/context.js
const db = require('../../utils/firebase');
const { getUserRef } = require('../../utils/userUtils');
const { log } = require('../../utils/logger');

class ContextManager {
    
    /**
     * בונה את ההקשר לשיחה עבור ה-AI
     * @param {string} userId - מזהה המשתמש
     * @param {string} platform - הפלטפורמה (discord/whatsapp/telegram)
     * @param {string} query - השאלה שהמשתמש שאל
     */
    async buildContext(userId, platform, query) {
        let contextData = `\n# מידע על המשתמש השואל:\n`;
        
        try {
            // 1. שליפת מידע מה-DB
            const userRef = await getUserRef(userId, platform);
            const doc = await userRef.get();
            
            if (doc.exists) {
                const data = doc.data();
                const name = data.identity?.displayName || 'Unknown Gamer';
                const balance = data.economy?.balance || 0;
                const level = Math.floor(0.1 * Math.sqrt(data.economy?.xp || 0)) || 1;
                const age = data.identity?.birthday?.age || 'לא ידוע';
                
                contextData += `- שם: ${name}\n`;
                contextData += `- רמה: ${level}\n`;
                contextData += `- כסף בארנק: ₪${balance}\n`;
                contextData += `- גיל: ${age}\n`;
                
                // הוספת מידע ספציפי אם רלוונטי
                if (query.includes('יום הולדת') && !data.identity?.birthday) {
                    contextData += `⚠️ הערה קריטית: המשתמש הזה עדיין לא הגדיר יום הולדת! תזכיר לו לעשות את זה דחוף.\n`;
                }
            } else {
                contextData += `- משתמש חדש (לא רשום ב-DB).\n`;
            }

            // 2. הוספת תאריך ושעה (חשוב לתשובות כמו "בוקר טוב")
            const now = new Date();
            contextData += `- תאריך ושעה עכשיו: ${now.toLocaleString('he-IL')}\n`;

            return contextData;

        } catch (error) {
            log(`⚠️ [AI Context] שגיאה בבניית הקשר: ${error.message}`);
            return ""; // לא נכשיל את השיחה בגלל זה
        }
    }
}

module.exports = new ContextManager();