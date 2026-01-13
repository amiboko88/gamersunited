// 📁 handlers/matchmaker.js
const db = require('../utils/firebase');
const { log } = require('../utils/logger');

const orphanLids = new Map();

class Matchmaker {

    async registerOrphan(lid, pushName, messageContent) {
        // במקום לשמור בזיכרון, שומרים ב-DB תחת מסמך מטא-דאטה
        const orphanRef = db.collection('system_metadata').doc('matchmaker_orphans');

        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(orphanRef);
                const data = doc.exists ? doc.data() : { list: {} };

                // עדכון הנתונים
                data.list[lid] = {
                    lid: lid,
                    name: pushName || "Unknown",
                    lastMsg: messageContent ? messageContent.substring(0, 50) : "...",
                    timestamp: Date.now()
                };

                t.set(orphanRef, data);
            });
            log(`🕵️ [Matchmaker] LID זר (${lid}) נשמר ב-DB.`);
        } catch (error) {
            console.error(`❌ [Matchmaker] Error saving orphan: ${error.message}`);
        }
    }

    async getOrphans() {
        try {
            const doc = await db.collection('system_metadata').doc('matchmaker_orphans').get();
            if (!doc.exists) return [];
            const list = doc.data().list || {};
            return Object.values(list);
        } catch (error) {
            console.error("Error fetching orphans:", error);
            return [];
        }
    }

    async removeOrphan(lid) {
        const orphanRef = db.collection('system_metadata').doc('matchmaker_orphans');
        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(orphanRef);
                if (!doc.exists) return;
                const data = doc.data();

                if (data.list && data.list[lid]) {
                    delete data.list[lid];
                    t.set(orphanRef, data);
                }
            });
        } catch (e) { }
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

            await userRef.update(updates);

            // הסרה מהרשימה (ב-DB)
            await this.removeOrphan(lid);
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