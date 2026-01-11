// 📁 whatsapp/utils/scout.js
const { log } = require('../../utils/logger');
const userUtils = require('../../utils/userUtils');
const db = require('../../utils/firebase'); // ✅ הוספה קריטית לבדיקת LID

class WhatsAppScout {
    
    /**
     * סורק את הקבוצה הראשית ומעדכן את כל המשתמשים ב-DB
     */
    async syncGroupMembers(sock, mainGroupId) {
        if (!sock || !mainGroupId) return;

        log(`🕵️ [WhatsApp Scout] מתחיל סריקת חברים בקבוצה: ${mainGroupId}`);

        try {
            // ייבוא ה-Resolver מהאינדקס (בצורה שתמנע מעגליות)
            const { getResolver } = require('../index'); 
            const resolveJid = getResolver();

            // 1. שליפת המטא-דאטה
            const metadata = await sock.groupMetadata(mainGroupId);
            const participants = metadata.participants;

            log(`🕵️ [WhatsApp Scout] נמצאו ${participants.length} חברים. מתחיל פענוח וסנכרון...`);

            let updatedUsers = 0;

            for (const p of participants) {
                // p.id הוא ה-LID (למשל: 123456@lid)
                const lid = p.id.split('@')[0];

                // 🛑 שלב 1: האם ה-LID הזה כבר מקושר למשתמש כלשהו ב-DB?
                // אם כן, אנחנו מדלגים עליו מיד. זה פותר את הבעיה שהם מופיעים כ"לא מזוהים".
                const existingLid = await db.collection('users').where('platforms.whatsapp_lid', '==', lid).limit(1).get();
                if (!existingLid.empty) {
                    continue; // המשתמש כבר קיים ומקושר, דלג.
                }

                // 🛑 שלב 2: פענוח מספר טלפון אמיתי
                const realPhoneNumber = resolveJid(p.id);
                
                // בדיקת שפיות: אם המספר קצר מדי, משהו לא תקין
                if (!realPhoneNumber || realPhoneNumber.length < 9) continue;

                // 🛑 שלב 3: יצירה/עדכון ב-DB
                // שינוי קריטי: אנחנו שולחים 'whatsapp_scout' כפלטפורמה.
                // זה יגרום ל-UserUtils להבין שזה ה-Scout ולא סתם הודעה, ויאפשר את היצירה.
                await userUtils.ensureUserExists(realPhoneNumber, "WhatsApp User", 'whatsapp_scout');
                updatedUsers++;
            }

            log(`✅ [WhatsApp Scout] סריקה הושלמה. ${updatedUsers} משתמשים חדשים/לא מקושרים עובדו.`);

        } catch (error) {
            log(`❌ [WhatsApp Scout] שגיאה בסריקה: ${error.message}`);
        }
    }
}

module.exports = new WhatsAppScout();