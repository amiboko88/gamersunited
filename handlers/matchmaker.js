// 📁 handlers/matchmaker.js
const db = require('../utils/firebase');
const { log } = require('../utils/logger'); 

const orphanLids = new Map(); 

class Matchmaker {
    
    async registerOrphan(lid, pushName, messageContent) {
        const existing = orphanLids.get(lid);
        const orphanData = {
            lid: lid,
            name: pushName || (existing ? existing.name : "Unknown"),
            lastMsg: messageContent ? messageContent.substring(0, 30) : (existing ? existing.lastMsg : "..."),
            timestamp: Date.now()
        };
        orphanLids.set(lid, orphanData);
        if (!existing || Date.now() - existing.timestamp > 60000) {
            log(`🕵️ [Matchmaker] LID זר (${lid}) נשמר במאגר להמתנה.`);
        }
    }

    getOrphans() {
        return Array.from(orphanLids.values());
    }

    /**
     * ביצוע הקישור - גרסה חכמה שלא דורסת טלפונים
     */
    async linkUser(discordId, lid) {
        try {
            const userRef = db.collection('users').doc(discordId);
            const doc = await userRef.get();

            if (!doc.exists) return { success: false, error: "משתמש לא נמצא ב-DB" };

            const userData = doc.data();
            
            // בדיקה: האם כבר יש מספר טלפון תקין?
            const existingPhone = userData.platforms?.whatsapp;
            const hasValidPhone = existingPhone && existingPhone.length >= 9 && existingPhone !== lid;

            const updates = {
                'platforms.whatsapp_lid': lid, // את ה-LID תמיד מעדכנים
                'meta.lastLinked': new Date().toISOString()
            };

            // אם אין טלפון תקין, אנחנו לא מעדכנים אותו כרגע, אלא נבקש מהמשתמש
            // אם יש טלפון תקין, אנחנו לא דורסים אותו!

            await userRef.set(updates, { merge: true });
            
            // הסרה מהרשימה
            orphanLids.delete(lid);
            log(`🔗 [Matchmaker] LID חובר: ${discordId} <-> ${lid}`);
            
            // החזרת סטטוס לדיסקורד
            if (hasValidPhone) {
                return { success: true, status: 'complete', phone: existingPhone };
            } else {
                return { success: true, status: 'needs_phone' };
            }

        } catch (error) {
            console.error(error);
            return { success: false, error: error.message };
        }
    }

    /**
     * עדכון מספר טלפון ידני (שלב ב' אם חסר)
     */
    async updateUserPhone(discordId, rawPhone) {
        try {
            const formattedPhone = rawPhone.replace(/\D/g, '');
            const finalPhone = formattedPhone.startsWith('05') ? '972' + formattedPhone.substring(1) : formattedPhone;

            await db.collection('users').doc(discordId).set({
                platforms: { whatsapp: finalPhone },
                identity: { whatsappPhone: finalPhone }
            }, { merge: true });

            return { success: true, phone: finalPhone };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

module.exports = new Matchmaker();