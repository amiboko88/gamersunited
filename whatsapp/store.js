// 📁 whatsapp/store.js
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
                // המידע מכיל גם LID וגם מספרים, וזה מה שחשוב לנו
                this.contacts[contact.id] = { 
                    ...(this.contacts[contact.id] || {}), 
                    ...contact 
                };
            }
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
     * מחפש איש קשר לפי ID (תומך LID)
     */
    getContact(id) {
        return this.contacts[id];
    }
}

module.exports = new SimpleStore();