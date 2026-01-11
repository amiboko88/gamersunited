// 📁 whatsapp/utils/scout.js
const { log } = require('../../utils/logger');
const userUtils = require('../../utils/userUtils');
// אנחנו ניגש ל-Index בצורה דינמית או נבקש להעביר את ה-Resolver
// כדי להימנע ממעגל תלויות (Circular Dependency), נעביר את ה-Resolver כפרמטר

class WhatsAppScout {
    
    /**
     * סורק את הקבוצה הראשית ומעדכן את כל המשתמשים ב-DB
     * מקבל את ה-Resolver מה-Index הראשי
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
                // p.id עשוי להיות LID. נפענח אותו למספר אמיתי בעזרת ה-Store!
                const realPhoneNumber = resolveJid(p.id);
                
                // בדיקת שפיות: אם המספר קצר מדי, משהו לא תקין
                if (realPhoneNumber.length < 9) continue;

                // עדכון ב-DB עם המספר האמיתי
                // אנחנו נשתמש ב-"WhatsApp User" זמנית, ה-ensure לא ידרוס אם יש שם קיים
                await userUtils.ensureUserExists(realPhoneNumber, "WhatsApp User", 'whatsapp');
                updatedUsers++;
            }

            log(`✅ [WhatsApp Scout] סריקה הושלמה. ${updatedUsers} משתמשים אומתו.`);

        } catch (error) {
            log(`❌ [WhatsApp Scout] שגיאה בסריקה: ${error.message}`);
        }
    }
}

module.exports = new WhatsAppScout();