const browserAdapter = require('./adapters/browser');
const rssAdapter = require('./adapters/rss');
const brain = require('../ai/brain');
const { log } = require('../../utils/logger');
const db = require('../../utils/firebase');
const stringSimilarity = require('string-similarity'); // ✅ Robust Fuzzy Search

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

    /**
     * Smart Search for Meta Weapons
     * Usage: getMeta("Kogot") -> Returns full data including code/image
     */
    async getMeta(query) {
        const data = await this._getData('meta', () => browserAdapter.getWZMeta());
        if (!data) return "❌ Intel Error: Satellite Offline.";

        const q = query.toLowerCase().trim();
        const allWeapons = data.absolute_meta || [];

        // Flatten categories strictly for search if absolute_meta is missing
        if (allWeapons.length === 0 && data.meta) {
            data.meta.forEach(cat => allWeapons.push(...cat.weapons));
        }

        if (allWeapons.length === 0) return "❌ No weapon data available.";

        // 1. Exact/Includes Match
        let found = allWeapons.find(w => w.name.toLowerCase().includes(q) || w.name.toLowerCase().replace(/[^a-z0-9]/g, '') === q.replace(/[^a-z0-9]/g, ''));

        // 2. Fuzzy Match (string-similarity)
        if (!found) {
            const weaponNames = allWeapons.map(w => w.name);
            const matches = stringSimilarity.findBestMatch(q, weaponNames);
            if (matches.bestMatch.rating > 0.4) { // 40% confidence threshold
                found = allWeapons.find(w => w.name === matches.bestMatch.target);
            }
        }

        // 3. 🧠 Brain Fallback (Super AI: Hebrew to English)
        // If we still didn't find it, ask the LLM what weapon this might be.
        if (!found && q.length > 2) {
            try {
                // Short, cheap call to identify weapon
                const candidates = allWeapons.map(w => w.name).slice(0, 50).join(', '); // Context
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
            // Return top 5 as fallback
            const top5 = allWeapons.slice(0, 5).map(w => w.name).join(', ');
            return `לא מצאתי נשק בשם "${query}".\n👑 **החזקים ביותר כרגע:** ${top5}`;
        }
    }

    async getPlaylists() {
        const modes = await this._getData('playlists', () => browserAdapter.getPlaylists());
        if (!modes || modes.length === 0) return "❌ לא הצלחתי למשוך את הפלייליסטים. נסה שוב מאוחר יותר.";

        return `🎮 **Active Playlists:**\n\n- ` + modes.join('\n- ');
    }

    async getBF6() {
        const weapons = await this._getData('bf6', () => browserAdapter.getBF6Meta());
        if (!weapons || weapons.length === 0) return "❌ BF6 Data Unavailable.";

        const top = weapons[0];
        return `🔫 **BF6 Meta King:** ${top.name}\n\n${top.attachments.join('\n')}`;
    }

    // --- NLP Routing ---

    /**
     * Routes natural language queries to the correct Intel function.
     * Returns a formatted response string/object or NULL if no Intel intent found.
     */
    async handleNaturalQuery(text) {
        const clean = text.toLowerCase().trim();

        // 1. Meta / Loadout
        // Keywords: Meta, Loadout, Build, Class, Code, Weapon (English & Hebrew Variations)
        const metaKeywords = [
            'meta', 'muta', 'loadout', 'build', 'class', 'code', 'weapon',
            'מטא', 'מטה', 'לודאוט', 'לודווט', 'לודאווט', 'בילד', 'מחלקה', 'קוד', 'נשק', 'רובה'
        ];

        if (metaKeywords.some(k => clean.includes(k))) {
            // 1. Remove Strategy Keywords
            let weapon = clean.replace(new RegExp(metaKeywords.join('|'), 'g'), ' ').trim();

            // 2. Tokenize & Filter Stop Words (More robust than Regex for Hebrew)
            const stopWords = new Set([
                'שמעון', 'שימי', 'תביא', 'לי', 'אפשר', 'יש', 'לך', 'עבור', 'בשביל', 'את', 'ה', 'ל',
                'שלח', 'תן', 'רוצה', 'צריך', 'מחפש', 'מבקש', 'מה', 'עם', 'זה',
                'shimon', 'simi', 'give', 'me', 'can', 'you', 'get', 'for', 'to', 'the', 'is', 'have', 'send', 'want', 'need'
            ]);

            let tokens = weapon.split(/\s+/);

            // Filter out stop words
            tokens = tokens.filter(t => !stopWords.has(t));

            // 3. Handle prefixes (Hebrew 'Lamed')
            // If token starts with 'ל' and is longer than 3 chars ("לקוגוט"), strip it
            tokens = tokens.map(t => (t.startsWith('ל') && t.length > 3) ? t.substring(1) : t);

            // 4. Rejoin
            weapon = tokens.join(' ').trim();
            weapon = weapon.replace(/[?!.]/g, ''); // Remove punctuation

            // 5. Fallback Heuristic: If we still have multiple words, take the LAST one (90% case)
            if (weapon.includes(' ')) {
                const words = weapon.split(' ');
                const lastWord = words[words.length - 1];
                if (lastWord.length > 2) {
                    const match = await this.getMeta(lastWord);
                    // Check if valid response (Object = Weapon found, String = Error/Not Found)
                    if (typeof match !== 'string' || !match.includes('לא מצאתי')) {
                        return match; // Found it!
                    }
                }
            }

            if (weapon.length > 1) {
                return await this.getMeta(weapon);
            } else {
                // ⚠️ CRITICIAL FIX: If user said "Give me meta" and we stripped everything, 
                // DO NOT return null (which triggers Brain Hallucination). Return the Top List.
                return await this.getMeta("absolute");
            }
        }

        // 2. Playlists
        if (clean.includes('playlist') || clean.includes('modes') || clean.includes('מודים') || clean.includes('משחק')) {
            return await this.getPlaylists();
        }

        // 3. News / Updates / Nerfs
        if (clean.includes('update') || clean.includes('news') || clean.includes('patch') || clean.includes('nerf') || clean.includes('buff') || clean.includes('עדכון') || clean.includes('חדשות') || clean.includes('נרף')) {
            return await this.getLatestNews(clean);
        }

        // 4. BF6
        if (clean.includes('bf6') || clean.includes('battlefield') || clean.includes('באטלפילד')) {
            return await this.getBF6();
        }

        // 5. Implicit Intent (Direct Weapon Name)
        // If the user just types "Kastov" or "Kogot" without "loadout", try to find it.
        // We only return if we get a STRONG match (Object, not error string).
        if (clean.length > 2 && clean.length < 20) {
            const potentialMatch = await this.getMeta(clean);
            if (typeof potentialMatch !== 'string') {
                log(`🧠 [Intel] Implicit Intent Detected: "${clean}" -> Weapon Found`);
                return potentialMatch;
            }
        }

        return null;
    }

    async getLatestNews(userQuery = "") {
        const updates = await rssAdapter.fetchNews();
        if (updates.length === 0) return "❌ לא מצאתי עדכונים ב-24 שעות האחרונות.";

        // If specific query (e.g. "nerfs?"), filter? For now, return the latest big update.
        const latest = updates[0];

        // If it's the Official Patch Notes, we have the "Deep Dive" summary already in latest.summary

        let response = `🚨 **${latest.title}**\n📅 ${new Date(latest.date).toLocaleDateString('he-IL')}\n\n${latest.summary}\n\n🔗 [קרא עוד](${latest.link})`;

        return response;
    }

    // --- Internal Logic ---

    // --- News / RSS ---

    async checkNews() {
        log('📰 [Intel] Checking for fresh news...');
        const updates = await rssAdapter.fetchNews();
        if (updates.length === 0) return;

        const dbRef = db.collection('system_metadata').doc('intel_news');
        const doc = await dbRef.get();
        const seenLinks = doc.exists ? (doc.data().seenLinks || []) : [];
        const newSeen = [...seenLinks];

        for (const news of updates) {
            if (seenLinks.includes(news.link)) continue;

            log(`📢 [Intel] Breaking News found: ${news.title}`);

            // Broadcast to all platforms
            await this._broadcastNews(news);

            newSeen.push(news.link);
        }

        // Keep DB clean (last 50 links)
        if (newSeen.length > 50) newSeen.splice(0, newSeen.length - 50);
        await dbRef.set({ seenLinks: newSeen }, { merge: true });
    }

    async _broadcastNews(news) {
        // AI Summary to Hebrew
        const summary = await brain.generateInternal(`
        Translate and summarize this COD news to Hebrew (Gamer Slang/Miltitary Tone):
        "${news.title} - ${news.summary}"
        Keep it short (2 sentences).
        `);

        if (!summary) return;

        const msg = `🚨 **עדכון מודיעין** (${news.source})\n\n${summary}\n\n[קרא עוד](${news.link})`;

        // 1. Discord
        if (this.discord) {
            // Find main channel
            const guild = this.discord.guilds.cache.first();
            const channel = guild?.channels.cache.find(c => c.name.includes('news') || c.name.includes('general'));
            if (channel) channel.send(msg);
        }

        // 2. WhatsApp
        if (this.whatsapp) {
            const mainGroup = process.env.WHATSAPP_MAIN_GROUP_ID;
            if (mainGroup) this.whatsapp.sendMessage(mainGroup, { text: msg });
        }

        // 3. Telegram
        if (this.telegram) {
            const chatId = process.env.TELEGRAM_CHAT_ID;
            if (chatId) this.telegram.api.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }
    }

    async _updateCache() {
        log('🔄 [Intel] Warming Cache...');
        try {
            this.cache.meta.data = await browserAdapter.getWZMeta();
            this.cache.meta.timestamp = Date.now();

            this.cache.playlists.data = await browserAdapter.getPlaylists();
            this.cache.playlists.timestamp = Date.now();

            this.cache.bf6.data = await browserAdapter.getBF6Meta();
            this.cache.bf6.timestamp = Date.now();

            log('✅ [Intel] Cache Updated.');
        } catch (e) {
            log(`⚠️ [Intel] Cache Update Failed: ${e.message}`);
        }
    }

    async _getData(key, fetchFunc) {
        const entry = this.cache[key];
        const isFresh = (Date.now() - entry.timestamp) < CACHE_TTL;

        if (entry.data && isFresh) {
            return entry.data;
        }

        log(`🔄 [Intel] Live Fetching ${key}...`);
        const newData = await fetchFunc();
        if (newData) {
            this.cache[key] = { data: newData, timestamp: Date.now() };
            return newData;
        }

        // Fallback to stale data if fetch fails
        return entry.data;
    }

    _formatWeaponResponse(weapon) {
        let text = `🔫 **${weapon.name}**\n\n`;
        weapon.attachments.forEach(a => {
            text += `*${a.part}*: ${a.name}\n`;
        });

        return {
            text: text,
            code: weapon.code,
            image: weapon.image
        };
    }
}

module.exports = new IntelManager();
