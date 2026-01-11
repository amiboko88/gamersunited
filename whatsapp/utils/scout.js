// 📁 whatsapp/utils/scout.js
const { log } = require('../../utils/logger');
const userUtils = require('../../utils/userUtils'); // לשימוש ב-getUserRef בלבד אם צריך
const db = require('../../utils/firebase');

class WhatsAppScout {
    
    async syncGroupMembers(sock, mainGroupId) {
        if (!sock || !mainGroupId) return;

        log(`🕵️ [WhatsApp Scout] מתחיל סריקת חברים בקבוצה: ${mainGroupId}`);

        try {
            // ייבוא ה-Resolver (כדי להמיר LID לטלפון)
            const { getResolver } = require('../index'); 
            const resolveJid = getResolver();

            const metadata = await sock.groupMetadata(mainGroupId);
            const participants = metadata.participants;

            // לוג התחלתי
            // log(`🕵️ [WhatsApp Scout] סורק ${participants.length} חברים...`);

            let recognizedUsers = 0;

            for (const p of participants) {
                const lid = p.id.split('@')[0];
                const realPhone = resolveJid(p.id); // מנסה להשיג טלפון

                // שלב 1: האם ה-LID הזה קיים ב-DB?
                const lidCheck = await db.collection('users').where('platforms.whatsapp_lid', '==', lid).limit(1).get();
                if (!lidCheck.empty) {
                    recognizedUsers++;
                    continue; // המשתמש מקושר ותקין.
                }

                // שלב 2: אם LID לא קיים, האם הטלפון קיים?
                if (realPhone) {
                    const phoneCheck = await db.collection('users').where('platforms.whatsapp', '==', realPhone).limit(1).get();
                    if (!phoneCheck.empty) {
                        // המשתמש קיים לפי טלפון! אבל חסר לו LID.
                        // אנחנו קוראים ל-ensureUserExists.
                        // בגלל התיקון ב-UserUtils, הוא *לא* ייצור משתמש חדש, 
                        // אלא יזהה את המשתמש הקיים ויוסיף לו את ה-LID (ריפוי עצמי).
                        await userUtils.ensureUserExists(lid, "Existing User", 'whatsapp');
                        recognizedUsers++;
                    }
                }
                
                // אם לא מצאנו לא LID ולא טלפון - אנחנו לא עושים כלום!
                // המשתמש יישאר "זר" עד שתקשר אותו ידנית.
            }

            log(`✅ [WhatsApp Scout] סריקה הסתיימה. ${recognizedUsers}/${participants.length} משתמשים מזוהים ומקושרים.`);

        } catch (error) {
            log(`❌ [WhatsApp Scout] שגיאה בסריקה: ${error.message}`);
        }
    }
}

module.exports = new WhatsAppScout();