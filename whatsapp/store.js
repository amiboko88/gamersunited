// 📁 whatsapp/store.js
const { log } = require('../utils/logger');

class SimpleStore {
    constructor() {
        this.contacts = {};
    }

    /**
     * מחבר את הזיכרון לאירועים של וואטסאפ
     */
    bind(ev) {
        // האזנה לעדכון רשימת אנשי קשר (בטעינה ראשונית)
        ev.on('contacts.upsert', (contacts) => {
            for (const contact of contacts) {
                // שומרים את איש הקשר לפי ה-ID שלו
                this.contacts[contact.id] = { 
                    ...(this.contacts[contact.id] || {}), 
                    ...contact 
                };
            }
            log(`🧠 [Store] נטענו ${contacts.length} אנשי קשר לזיכרון.`);
        });

        // האזנה לשינויים באנשי קשר
        ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                if (this.contacts[update.id]) {
                    Object.assign(this.contacts[update.id], update);
                } else {
                    this.contacts[update.id] = update;
                }
            }
        });
    }

    /**
     * מחזיר את כל הזיכרון (לדיבוג)
     */
    getAll() {
        return this.contacts;
    }
}

module.exports = new SimpleStore();