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
        // 1. Try COD (Priority)
        const codData = await this._getData('meta', () => codSource.getMeta());
        const codResult = await codSource.searchWeapon(query, codData);

        // If found valid weapon, return it
        if (codResult && codResult.isWeapon) return codResult;

        // 2. Try BF6 (Fallback)
        const bf6Data = await this._getData('bf6', () => bf6Source.getMeta());
        // We need a search method in BF6 source too, or ad-hoc here.
        // Let's implement text search for BF6 here since it's simple list.
        if (bf6Data && Array.isArray(bf6Data)) {
            const q = query.toLowerCase().trim();
            const found = bf6Data.find(w => w.name.toLowerCase().includes(q));
            if (found) {
                return {
                    text: `🔫 **${found.name}** (BF6)\n\n${found.attachments.map(a => `• ${a.part}: ${a.name}`).join('\n')}`,
                    image: found.image,
                    isWeapon: true
                };
            }
        }

        // 3. Return original failure or tailored message
        return codResult;
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
        if (clean.includes('nvidia') || clean.includes('דרייבר')) {
            const updates = await nvidiaSource.getUpdates();
            // Wrap in Enricher if user asked a question or just general "update"
            if (updates && updates.link && (clean.length > 15 || clean.includes('what') || clean.includes('מה'))) {
                return await enricher.enrich(updates, text);
            }
            return nvidiaSource.formatUpdate(updates);
        }

        if (clean.includes('playlist') || clean.includes('modes') || clean.includes('מודים')) return await this.getPlaylists();

        // 1. Updates (High Priority)
        const updateKeywords = ['update', 'patch', 'עדכון', 'חדש', 'changes', 'אפדייט', 'news', 'חדשות', 'שינויים'];
        if (updateKeywords.some(k => clean.includes(k))) {
            if (clean.includes('bf6')) {
                const updates = await bf6Source.getUpdates();
                if (updates && updates.link) {
                    return await enricher.enrich(updates, text);
                }
                return "❌ No recent BF6 updates found.";
            }
            return await this.getLatestNews(text); // COD (Enriched)
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

                // 1. Ancient History Guard: If update is older than 48 hours, IGNORE IT.
                // This protects against DB wipes or resets causing spam.
                const updateTime = new Date(item.date).getTime();
                const now = Date.now();
                if ((now - updateTime) > 48 * 60 * 60 * 1000) {
                    // Too old to broadcast, but we update cache to suppress future checks
                    // Only update DB if we don't have it, to keep sync
                    if (md[check.titleKey] !== item.title) {
                        await docRef.set({ [check.dateKey]: item.date, [check.titleKey]: item.title }, { merge: true });
                    }
                    continue;
                }

                let isNew = false;
                const lastTitle = md[check.titleKey];
                const lastDate = md[check.dateKey];

                // 2. First Run / Empty DB Guard: 
                // If we have NO history for this source, do NOT broadcast. Just save silently.
                // This prevents spamming "new" news when the bot is first installed or DB is fresh.
                if (!lastTitle && !lastDate) {
                    log(`🛡️ [Intel] First run check for ${check.type}. Saving baseline (Silent).`);
                    await docRef.set({ [check.dateKey]: item.date, [check.titleKey]: item.title }, { merge: true });
                    continue;
                }

                if (check.checkType === 'title') {
                    // Strict Title Check
                    if (item.title && item.title !== lastTitle) isNew = true;
                } else {
                    // Date Check (Legacy/COD)
                    const savedTime = new Date(lastDate || 0).getTime();
                    if (updateTime > savedTime) isNew = true;
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
