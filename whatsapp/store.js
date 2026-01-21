// 📁 whatsapp/store.js
const { log } = require('../utils/logger');

class SimpleStore {
    constructor() {
        this.contacts = {}; // Key: JID
        this.lidMap = {};   // Key: LID -> JID
        this.messages = {}; // Key: JID -> Array of messages (Max 50)
    }

    /**
     * Bind to events
     */
    bind(ev) {
        // 1. Load History
        ev.on('messaging-history.set', ({ contacts }) => {
            if (!contacts) return;
            let lidCount = 0;
            for (const contact of contacts) {
                this._updateContact(contact);
                if (contact.lid) lidCount++;
            }
            log(`🧠 [Store] History Loaded: ${contacts.length} contacts (${lidCount} with LID).`);
        });

        // 2. Contacts Upsert
        ev.on('contacts.upsert', (contacts) => {
            for (const contact of contacts) {
                this._updateContact(contact);
            }
        });

        // 3. Contacts Update
        ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                this._updateContact(update);
            }
        });

        // ✅ 4. Messages Upsert (Rolling Buffer)
        ev.on('messages.upsert', ({ messages }) => {
            for (const msg of messages) {
                if (msg.key.remoteJid) {
                    this.addMessage(msg.key.remoteJid, msg);
                }
            }
        });

        // 5. Load LIDs from DB
        this.loadLidsFromDB().catch(e => log(`❌ [Store] LID Hydration Failed: ${e.message}`));
    }

    /**
     * Load known LIDs from DB to memory
     */
    async loadLidsFromDB() {
        try {
            const db = require('../utils/firebase');
            const snapshot = await db.collection('users').get();
            let loaded = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                const waPhone = data.platforms?.whatsapp;
                const waLid = data.platforms?.whatsapp_lid;

                if (waPhone && waLid) {
                    this.lidMap[waLid] = waPhone + '@s.whatsapp.net';
                    loaded++;
                }
            });
            log(`📂 [Store] Hydrated ${loaded} LIDs from DB.`);
        } catch (e) {
            log(`⚠️ [Store] DB Hydration Warning: ${e.message}`);
        }
    }

    addContacts(contacts) {
        if (!contacts || !Array.isArray(contacts)) return;
        for (const contact of contacts) {
            this._updateContact(contact);
        }
    }

    _updateContact(contact) {
        const id = contact.id;
        this.contacts[id] = {
            ...(this.contacts[id] || {}),
            ...contact
        };
        if (contact.lid) {
            this.lidMap[contact.lid] = id;
        }
    }

    getPhoneById(identifier) {
        if (!identifier) return null;
        const cleanId = identifier.split('@')[0];

        // Direct Lookup
        if (identifier.includes('@s.whatsapp.net') && !this.lidMap[identifier]) {
            // Maybe check if it's a contact?
        }

        // LID Lookup
        const mappedJid = this.lidMap[identifier] || this.lidMap[cleanId];
        if (mappedJid) {
            return mappedJid.split('@')[0];
        }

        // Brute Force Reverse Lookup
        const found = Object.values(this.contacts).find(c => c.lid === identifier || c.lid === cleanId);
        if (found && found.id) {
            return found.id.split('@')[0];
        }

        return cleanId;
    }

    getContact(jid) {
        return this.contacts[jid];
    }

    // --- 📨 Message Buffer Logic ---

    addMessage(jid, msg) {
        if (!jid || !msg) return;
        if (!this.messages[jid]) this.messages[jid] = [];

        // Append
        this.messages[jid].push(msg);

        // Limit to 50
        if (this.messages[jid].length > 50) {
            this.messages[jid].shift(); // Remove oldest
        }
    }

    getMessages(jid) {
        return this.messages[jid] || [];
    }
}

module.exports = new SimpleStore();