// 📁 whatsapp/utils/scout.js
const { log } = require('../../utils/logger');
const userUtils = require('../../utils/userUtils');

class WhatsAppScout {
    
    /**
     * סורק את הקבוצה הראשית ומעדכן את כל המשתמשים ב-DB עם המספרים האמיתיים
     */
    async syncGroupMembers(sock, mainGroupId) {
        if (!sock || !mainGroupId) return;

        log(`🕵️ [WhatsApp Scout] מתחיל סריקת חברים בקבוצה: ${mainGroupId}`);

        try {
            // 1. שליפת המטא-דאטה (מחזיר JIDs אמיתיים)
            const metadata = await sock.groupMetadata(mainGroupId);
            const participants = metadata.participants; // מערך של { id, admin }

            log(`🕵️ [WhatsApp Scout] נמצאו ${participants.length} חברים. מסנכרן ל-DB...`);

            let newUsers = 0;
            let updatedUsers = 0;

            for (const p of participants) {
                // p.id הוא תמיד המספר האמיתי (למשל 97252...@s.whatsapp.net)
                const realPhoneNumber = p.id.split('@')[0];
                const isAdmin = (p.admin === 'admin' || p.admin === 'superadmin');

                // בדיקה ועדכון ב-DB
                // אנחנו שולחים "WhatsApp User" כשם זמני אם המשתמש לא קיים
                // הפונקציה ensureUserExists תדאג לא לדרוס שם קיים אם יש
                await userUtils.ensureUserExists(realPhoneNumber, "WhatsApp User", 'whatsapp');
                updatedUsers++;
            }

            log(`✅ [WhatsApp Scout] סריקה הושלמה בהצלחה.`);

        } catch (error) {
            log(`❌ [WhatsApp Scout] שגיאה בסריקה: ${error.message}`);
        }
    }
}

module.exports = new WhatsAppScout();