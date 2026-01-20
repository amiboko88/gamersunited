const codSource = require('./sources/cod');
const bf6Source = require('./sources/bf6');
const nvidiaSource = require('./sources/nvidia');

const broadcaster = require('./services/broadcaster');
const enricher = require('./services/enricher');

const { log } = require('../../utils/logger');
const db = require('../../utils/firebase');

const CACHE_TTL = 60 * 60 * 1000; // 1 Hour Cache

class IntelManager {
    constructor() {
        this.cache = {
            meta: { data: null, timestamp: 0 },
            playlists: { data: null, timestamp: 0 },
            bf6: { data: null, timestamp: 0 }
        };
        // Clients container for broadcaster
        this.clients = { discord: null, whatsapp: null, telegram: null };
    }

    // --- Public API ---

    async initIntel(discordClient, whatsappSock, telegramBot) {
        this.clients.discord = discordClient;
        this.clients.whatsapp = whatsappSock;
        this.clients.telegram = telegramBot;

        log('🧠 [Intel] System 2.0 (The Newsroom) Initialized.');
        this._updateCache();
    }

    // --- Core Data Fetchers (Delegated) ---

    async getMeta(query) {
        const data = await this._getData('meta', () => codSource.getMeta());
        return await codSource.searchWeapon(query, data);
    }

    async getPlaylists() {
        const modes = await this._getData('playlists', () => codSource.getPlaylists());
        if (!modes || modes.length === 0) return "❌ לא הצלחתי למשוך את הפלייליסטים. נסה שוב מאוחר יותר.";
        return `🎮 **Active WZ Playlists:**\n\n- ` + modes.join('\n- ');
    }

    async getBF6() {
        const weapons = await this._getData('bf6', () => bf6Source.getMeta());
        return bf6Source.getFormattedMeta(weapons);
    }

    async getNvidia() {
        const updates = await nvidiaSource.getUpdates();
        return nvidiaSource.formatUpdate(updates);
    }

    async getCODUpdates() {
        const update = await codSource.getPatchNotes();
        if (!update) return "❌ לא מצאתי עדכוני COD רשמיים.";
        return `🚨 **${update.title}**\n📅 ${new Date(update.date).toLocaleDateString('he-IL')}\n\n${update.summary}\n\n🔗 [קרא עוד](${update.link})`;
    }

    async getLatestNews(userQuery = "") {
        const baseUpdate = await codSource.getPatchNotes();
        if (baseUpdate && baseUpdate.link) {
            return await enricher.enrich(baseUpdate, userQuery);
        }
        return baseUpdate;
    }

    // --- NLP Routing ---

    async handleNaturalQuery(text) {
        let clean = text.toLowerCase().trim().replace(/[?.,!]/g, '');

        // Dictionary Normalization
        clean = clean.replace(/וורזון/g, 'warzone')
            .replace(/בילד/g, 'build').replace(/ביולד/g, 'build')
            .replace(/לואודווט/g, 'loadout').replace(/לודווט/g, 'loadout').replace(/לודאוט/g, 'loadout')
            .replace(/קוד/g, 'code')
            .replace(/בתאל/g, 'bf6').replace(/באטלפילד/g, 'bf6').replace(/redsec/g, 'bf6')
            .replace(/בmeta/g, ' meta').replace(/בwarzone/g, ' warzone');

        log(`🧠 [Intel] Normalized Query: "${clean}"`);

        // 0. Specific High-Priority Routes (Must be before Generic Updates)
        if (clean.includes('nvidia') || clean.includes('דרייבר')) return await this.getNvidia();
        if (clean.includes('playlist') || clean.includes('modes') || clean.includes('מודים')) return await this.getPlaylists();

        // 1. Updates (High Priority)
        const updateKeywords = ['update', 'patch', 'עדכון', 'חדש', 'changes', 'אפדייט', 'news', 'חדשות', 'שינויים'];
        if (updateKeywords.some(k => clean.includes(k))) {
            if (clean.includes('bf6')) return await bf6Source.getUpdates();
            return await this.getCODUpdates();
        }

        // 2. Specific High-Priority Routes (BF6 Meta is handled here or below?)
        if (clean.includes('bf6')) return await this.getBF6();

        // 3. Weapon Logic (Delegated to COD Source via getMeta)
        const metaKeywords = ['meta', 'loadout', 'build', 'code', 'weapon', 'class', 'נשק', 'רובה', 'נשקים', 'רובים'];

        if (metaKeywords.some(k => clean.includes(k))) {
            const significantWords = clean.split(' ').filter(w => !metaKeywords.includes(w) && w.length > 2);
            const filler = ['הכי', 'טובים', 'חזקים', 'כרגע', 'עכשיו', 'טוב', 'חזק', 'best', 'good', 'top', 'current', 'now', 'ב', 'give', 'me'];
            const realWords = significantWords.filter(w => !filler.includes(w));

            if (realWords.length === 0 || clean.includes('הכי חזק') || clean === 'meta') {
                return await this.getMeta("absolute");
            }

            // Clean weapon name
            let weaponName = clean;
            metaKeywords.forEach(k => { weaponName = weaponName.replace(k, ''); });

            const stopWords = ['give', 'me', 'the', 'for', 'is', 'what', 'are', 'in', 'תן', 'לי', 'את', 'ה', 'בשביל', 'של', 'מה', 'יש', 'ב', 'כרגע', 'ל', 'תביא', 'אפשר', 'רוצה', 'צריך', 'מחפש'];
            stopWords.forEach(sw => { weaponName = weaponName.replace(new RegExp(`(^|\\s)${sw}($|\\s)`, 'g'), ' ').trim(); });

            if (weaponName.replace(/\s+/g, ' ').trim().length > 1) {
                return await this.getMeta(weaponName);
            }
        }

        // Implicit Intent
        if (clean.length > 2 && clean.length < 20) {
            const potentialMatch = await this.getMeta(clean);
            if (potentialMatch && potentialMatch.code) {
                log(`🧠 [Intel] Implicit Intent Detected: "${clean}"`);
                return potentialMatch;
            }
        }

        return null;
    }

    // --- Automated News Cycle (Scheduler) ---
    async checkNews() {
        try {
            log('🕵️ [Intel] Checking for fresh intel...');
            const docRef = db.collection('system_metadata').doc('intel_status');
            const doc = await docRef.get();
            const md = doc.exists ? doc.data() : {};

            const checks = [
                {
                    source: codSource, method: 'getPatchNotes',
                    titleKey: 'last_title', dateKey: 'last_patch_date', type: 'COD',
                    checkType: 'date'
                },
                {
                    source: nvidiaSource, method: 'getUpdates',
                    titleKey: 'last_nvidia_title', dateKey: 'last_nvidia_date', type: 'NVIDIA',
                    checkType: 'title'
                },
                {
                    source: bf6Source, method: 'getUpdates',
                    titleKey: 'last_bf6_title', dateKey: 'last_bf6_date', type: 'BF6',
                    checkType: 'title'
                }
            ];

            for (const check of checks) {
                const item = await check.source[check.method]();
                if (!item || typeof item === 'string') continue;

                let isNew = false;
                const lastTitle = md[check.titleKey] || "";

                if (check.checkType === 'title') {
                    // Strict Title Check
                    if (item.title !== lastTitle) isNew = true;
                } else {
                    // Date Check (Legacy/COD)
                    const lastDate = md[check.checkType] || 0;
                    const updateDate = new Date(item.date).getTime();
                    const savedDate = new Date(lastDate).getTime();
                    // 24h freshness
                    if (updateDate > savedDate && (Date.now() - updateDate) < 24 * 60 * 60 * 1000) isNew = true;
                }

                if (isNew) {
                    log(`🚨 [Intel] NEW ${check.type} DETECTED: ${item.title}`);
                    await broadcaster.broadcast(item, this.clients);

                    await docRef.set({
                        [check.dateKey]: item.date,
                        [check.titleKey]: item.title
                    }, { merge: true });
                }
            }

        } catch (e) {
            log(`❌ [Intel] News Cycle Failed: ${e.message}`);
        }
    }

    // --- Internal Helpers ---
    async _updateCache() {
        if (!process.env.FIREBASE_PRIVATE_KEY) return;
        try {
            await Promise.all([
                this._getData('meta', () => codSource.getMeta()),
                this._getData('playlists', () => codSource.getPlaylists()),
                this._getData('bf6', () => bf6Source.getMeta())
            ]);
        } catch (e) { }
    }
    async _getData(key, fetchFunc) {
        if (this.cache[key] && this.cache[key].data && (Date.now() - this.cache[key].timestamp < CACHE_TTL)) {
            return this.cache[key].data;
        }
        const data = await fetchFunc();
        if (data) {
            this.cache[key].data = data;
            this.cache[key].timestamp = Date.now();
        }
        return data;
    }
}

module.exports = new IntelManager();
