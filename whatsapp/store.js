// 📁 whatsapp/store.js
const { log } = require('../utils/logger');

class SimpleStore {
    constructor() {
        this.contacts = {}; // מפתח: JID (טלפון)
        this.lidMap = {};   // מפתח: LID -> ערך: JID
    }

    /**
     * מחבר את הזיכרון לאירועים של וואטסאפ
     */
    bind(ev) {
        // 1. הצינור הראשי: היסטוריית ההודעות ואנשי הקשר (קורה בשניות הראשונות לחיבור)
        ev.on('messaging-history.set', ({ contacts }) => {
            if (!contacts) return;

            let lidCount = 0;
            for (const contact of contacts) {
                this._updateContact(contact);
                if (contact.lid) lidCount++;
            }
            log(`🧠 [Store] היסטוריה נטענה: ${contacts.length} אנשי קשר (מתוכם ${lidCount} עם LID).`);
        });

        // 2. עדכונים שוטפים (Upsert)
        ev.on('contacts.upsert', (contacts) => {
            for (const contact of contacts) {
                this._updateContact(contact);
            }
        });

        // 3. עדכונים ספציפיים (Update)
        ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                // לעיתים העדכון מכיל רק LID ו-ID, זה זהב בשבילנו
                this._updateContact(update);
            }
        });

        // 4. טעינת LIDs מהמסד נתונים (Hydration)
        this.loadLidsFromDB().catch(e => log(`❌ [Store] LID Hydration Failed: ${e.message}`));
    }

    /**
     * טוען את כל ה-LIDs הידועים מה-DB לזיכרון (כדי לא לשכוח משתמשים)
     */
    async loadLidsFromDB() {
        const db = require('../utils/firebase');
        const snapshot = await db.collection('users').get();
        let loaded = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const waPhone = data.platforms?.whatsapp; // המספר האמיתי (ID)
            const waLid = data.platforms?.whatsapp_lid; // המספר הארוך (LID)

            if (waPhone && waLid) {
                // שמירה במפה בזיכרון
                this.lidMap[waLid] = waPhone + '@s.whatsapp.net';
                loaded++;
            }
        });
        log(`📂 [Store] נטענו ${loaded} LIDs מה-DB לזיכרון.`);
    }

    /**
     * הוספה ידנית של אנשי קשר (למשל מה-Scout)
     */
    addContacts(contacts) {
        if (!contacts || !Array.isArray(contacts)) return;
        for (const contact of contacts) {
            this._updateContact(contact);
        }
    }

    /**
     * פונקציה פנימית לעדכון ומיפוי
     */
    _updateContact(contact) {
        const id = contact.id; // זה בדרך כלל ה-JID (טלפון)

        // שמירה בזיכרון הראשי
        this.contacts[id] = {
            ...(this.contacts[id] || {}),
            ...contact
        };

        // מיפוי LID -> JID (החלק הקריטי)
        if (contact.lid) {
            this.lidMap[contact.lid] = id;
        }
    }

    /**
     * מנסה למצוא מספר טלפון (JID) לפי מזהה כלשהו (LID או JID)
     */
    getPhoneById(identifier) {
        if (!identifier) return null;
        const cleanId = identifier.split('@')[0];

        // 1. אם זה כבר נראה כמו JID (טלפון), נחזיר אותו
        // (בדיקה פשוטה: אם זה לא LID, אז זה כנראה טלפון)
        if (identifier.includes('@s.whatsapp.net') && !this.lidMap[identifier]) {
            // אבל רגע, אולי זה LID שפשוט יש לו סיומת כזו? נבדוק במפה
        }

        // 2. בדיקה במפת ה-LID (הכי מדויק)
        // מנסים לחפש את ה-LID המלא, או רק את המספר
        const mappedJid = this.lidMap[identifier] || this.lidMap[cleanId];
        if (mappedJid) {
            return mappedJid.split('@')[0]; // מחזירים מספר נקי
        }

        // 3. חיפוש הפוך ברוטלי (למקרה שהמפה התפקששה)
        const found = Object.values(this.contacts).find(c => c.lid === identifier || c.lid === cleanId);
        if (found && found.id) {
            return found.id.split('@')[0];
        }

        return cleanId;
    }

    getContact(jid) {
        return this.contacts[jid];
    }
}

module.exports = new SimpleStore();