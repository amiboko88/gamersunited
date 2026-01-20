const browserAdapter = require('./adapters/browser');
const rssAdapter = require('./adapters/rss'); // Acts as the Manager now
const brain = require('../ai/brain');
const { log } = require('../../utils/logger');
const db = require('../../utils/firebase');
const stringSimilarity = require('string-similarity');

const CACHE_TTL = 60 * 60 * 1000; // 1 Hour Cache

class IntelManager {
    constructor() {
        this.cache = {
            meta: { data: null, timestamp: 0 },
            playlists: { data: null, timestamp: 0 },
            bf6: { data: null, timestamp: 0 }
        };
    }

    // --- Public API ---

    async initIntel(discordClient, whatsappSock, telegramBot) {
        this.discord = discordClient;
        this.whatsapp = whatsappSock;
        this.telegram = telegramBot;

        log('🧠 [Intel] System 2.0 (The Newsroom) Initialized.');
        this._updateCache();
    }

    // --- Core Data Fetchers ---

    async getMeta(query) {
        const data = await this._getData('meta', () => browserAdapter.getWZMeta());
        if (!data) return "❌ Intel Error: Satellite Offline.";

        const q = query.toLowerCase().trim();

        // Handle "Absolute" / "Meta" general queries
        if (q === 'absolute' || q === 'meta' || q.includes('מטא') || q.includes('הכי חזק')) {
            if (data.absolute_meta && data.absolute_meta.length > 0) {
                const list = data.absolute_meta.slice(0, 5).map(w => `• ${w.name}`).join('\n');
                return `👑 **ABSOLUTE META (הכי חזקים):**\n${list}\n\nלפירוט על נשק, כתוב: "תן לי בילד ל[שם הנשק]"`;
            }
        }

        const allWeapons = data.absolute_meta || [];
        // Flatten categories
        if (data.meta) {
            data.meta.forEach(cat => allWeapons.push(...cat.weapons));
        }

        if (allWeapons.length === 0) return "❌ No weapon data available.";

        // 1. Exact/Includes Match
        let found = allWeapons.find(w => w.name.toLowerCase().includes(q) || w.name.toLowerCase().replace(/[^a-z0-9]/g, '') === q.replace(/[^a-z0-9]/g, ''));

        // 2. Fuzzy Match
        if (!found) {
            const weaponNames = allWeapons.map(w => w.name);
            const matches = stringSimilarity.findBestMatch(q, weaponNames);
            if (matches.bestMatch.rating > 0.4) {
                found = allWeapons.find(w => w.name === matches.bestMatch.target);
            }
        }

        // 3. Brain Fallback
        if (!found && q.length > 2) {
            try {
                const candidates = allWeapons.map(w => w.name).slice(0, 50).join(', ');
                const aiGuess = await brain.generateInternal(`
                User searched for weapon: "${query}" (Hebrew/Typo).
                Identify the REAL weapon name from this list: [${candidates}]
                Return ONLY the exact weapon name. If unsure, return "NULL".
                `);

                if (aiGuess && aiGuess !== 'NULL') {
                    found = allWeapons.find(w => w.name.toLowerCase() === aiGuess.toLowerCase().trim());
                    if (found) log(`🧠 [Intel] AI Resolved "${query}" -> "${found.name}"`);
                }
            } catch (e) { /* Ignore AI fail */ }
        }

        if (found) {
            return this._formatWeaponResponse(found);
        } else {
            return {
                text: `לא מצאתי נשק בשם "${query}".\nנסה לחפש אחד מהרשימה:\n${allWeapons.slice(0, 5).map(w => w.name).join(', ')}`
            };
        }
    }

    async getPlaylists() {
        const modes = await this._getData('playlists', () => browserAdapter.getPlaylists());
        if (!modes || modes.length === 0) return "❌ לא הצלחתי למשוך את הפלייליסטים. נסה שוב מאוחר יותר.";
        return `🎮 **Active WZ Playlists:**\n\n- ` + modes.join('\n- ');
    }

    async getBF6() {
        const weapons = await this._getData('bf6', () => browserAdapter.getBF6Meta());
        if (!weapons || weapons.length === 0) return "❌ BF6 Data Unavailable.";
        const top = weapons[0];
        return this._formatWeaponResponse(top, "BF6 Meta King");
    }

    async getNvidia() {
        const updates = await browserAdapter.getNvidiaDriverUpdates();
        if (!updates) return "❌ לא מצאתי עדכוני NVIDIA.";
        return `🖥️ **${updates.title}**\n\n${updates.summary}\n\n🔗 ${updates.link}`;
    }

    async getCODUpdates() {
        const update = await browserAdapter.getCODPatchNotes();
        if (!update) return "❌ לא מצאתי עדכוני COD רשמיים.";
        return `🚨 **${update.title}**\n📅 ${new Date(update.date).toLocaleDateString('he-IL')}\n\n${update.summary}\n\n🔗 [קרא עוד](${update.link})`;
    }

    // --- NLP Routing ---

    async handleNaturalQuery(text) {
        let clean = text.toLowerCase().trim();

        // Remove Punctuation for cleaner matches
        clean = clean.replace(/[?.,!]/g, '');

        // --- 0. Dictionary Normalization (Hebrew -> Key Terms) ---
        clean = clean.replace(/וורזון/g, 'warzone')
            .replace(/בילד/g, 'build')
            .replace(/ביולד/g, 'build')
            .replace(/לואודווט/g, 'loadout')
            .replace(/לודווט/g, 'loadout')
            .replace(/לודאוט/g, 'loadout')
            .replace(/קוד/g, 'code')
            .replace(/בתאל/g, 'bf6') // User specific
            .replace(/באטלפילד/g, 'bf6')
            .replace(/redsec/g, 'bf6') // User specific map to BF6 logic
            // Preposition Fixes
            .replace(/בmeta/g, ' meta')
            .replace(/בwarzone/g, ' warzone');

        log(`🧠 [Intel] Normalized Query: "${clean}"`);

        // --- 1. Specific High-Priority Routes ---

        // BF6 / Redsec
        if (clean.includes('bf6')) {
            return await this.getBF6();
        }

        // Nvidia
        if (clean.includes('nvidia') || clean.includes('דרייבר')) {
            return await this.getNvidia();
        }

        // Playlists
        if (clean.includes('playlist') || clean.includes('modes') || clean.includes('מודים') || clean.includes('משחק')) {
            return await this.getPlaylists();
        }

        // Official Updates (COD / WZ)
        // User said: "Warzone Update" -> Official COD Site
        const updateKeywords = ['update', 'patch', 'עדכון', 'חדש', 'changes', 'אפדייט', 'news', 'חדשות', 'שינויים'];
        if (updateKeywords.some(k => clean.includes(k))) {
            if (clean.includes('bf6')) return await browserAdapter.getBF6News(); // Future proofing
            // Default to COD for generic update queries
            return await this.getCODUpdates();
        }

        // --- 2. Meta / Weapon Logic ---
        // Keywords: Meta, Loadout, Build, Code, Weapon
        const metaKeywords = ['meta', 'loadout', 'build', 'code', 'weapon', 'class', 'נשק', 'רובה', 'נשקים', 'רובים', 'הנשקים', 'הרובים'];

        if (metaKeywords.some(k => clean.includes(k))) {

            // A. General Meta Query ("Give me meta", "What is meta?")
            // If the query is SHORT and barely has words other than "meta", return the list.
            const significantWords = clean.split(' ').filter(w => !metaKeywords.includes(w) && w.length > 2);

            // Check if significant words are just common filler like "good", "best", "now", "here"
            const filler = ['הכי', 'טובים', 'חזקים', 'כרגע', 'עכשיו', 'טוב', 'חזק', 'best', 'good', 'top', 'current', 'now', 'ב'];
            const realWords = significantWords.filter(w => !filler.includes(w));

            if (realWords.length === 0 || clean.includes('הכי חזק') || clean === 'meta') {
                return await this.getMeta("absolute");
            }

            // B. Specific Weapon Extraction
            // Remove keywords to isolate weapon name
            let weaponName = clean;
            metaKeywords.forEach(k => { weaponName = weaponName.replace(k, ''); });

            // Remove stop words (Expanded)
            const stopWords = [
                'give', 'me', 'the', 'for', 'is', 'what', 'are', 'in',
                'תן', 'לי', 'את', 'ה', 'בשביל', 'של', 'מה', 'יש', 'ב', 'כרגע', 'ל',
                'תביא', 'אפשר', 'רוצה', 'צריך', 'מחפש', 'מבקש', 'איזה', 'אילו'
            ];

            stopWords.forEach(sw => {
                weaponName = weaponName.replace(new RegExp(`(^|\\s)${sw}($|\\s)`, 'g'), ' ').trim();
                // Twice for adjacent stop words
                weaponName = weaponName.replace(new RegExp(`(^|\\s)${sw}($|\\s)`, 'g'), ' ').trim();
            });

            weaponName = weaponName.replace(/\s+/g, ' ').trim();

            if (weaponName.length > 1) {
                return await this.getMeta(weaponName);
            }
        }

        // Fallback: Implicit Intent (Direct Weapon Name)
        if (clean.length > 2 && clean.length < 20) {
            // Only return if it finds a REAL result object
            const potentialMatch = await this.getMeta(clean);
            if (potentialMatch && potentialMatch.code) { // Check for 'code' property to confirm it's a weapon object
                log(`🧠 [Intel] Implicit Intent Detected: "${clean}"`);
                return potentialMatch;
            }
        }

        return null;
    }

    async getLatestNews(userQuery = "") {
        // Legacy method tailored to "Updates" route now
        return await this.getCODUpdates();
    }

    // --- Formatters ---

    _formatWeaponResponse(weapon, titlePrefix = "") {
        // Better Formatting
        let text = `🔫 **${titlePrefix || weapon.name}**\n\n`;

        if (weapon.attachments && weapon.attachments.length > 0) {
            weapon.attachments.forEach(a => {
                // Handle BF6 string vs WZ Object
                if (typeof a === 'string') text += `• ${a}\n`;
                else text += `• **${a.part}**: ${a.name}\n`;
            });
        }

        // Separating Code from Image Logic
        // The return object is handled by the platform adapters (Whatsapp/Discord)
        // We ensure 'code' is distinct.
        return {
            text: text,
            code: weapon.code || "No Code Available", // Distinct field
            image: weapon.image,
            isWeapon: true // Flag for handlers
        };
    }

    // --- Internal Helpers ---
    async _updateCache() {
        if (!process.env.FIREBASE_PRIVATE_KEY) return; // Skip in dev/test if no creds
        try {
            this.cache.meta.data = await browserAdapter.getWZMeta();
            this.cache.meta.timestamp = Date.now();
            this.cache.playlists.data = await browserAdapter.getPlaylists();
            this.cache.playlists.timestamp = Date.now();
            this.cache.bf6.data = await browserAdapter.getBF6Meta();
            this.cache.bf6.timestamp = Date.now();
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
