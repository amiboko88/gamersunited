const browserAdapter = require('./adapters/browser');
const rssAdapter = require('./adapters/rss');
const brain = require('../ai/brain');
const { log } = require('../../utils/logger');
const db = require('../../utils/firebase');
const graphics = require('../graphics/index'); // For weapon cards if needed

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

        // Initial Fetch (Lazy or Eager?)
        // Let's do a background fetch to warm the cache
        this._updateCache();
    }

    /**
     * Smart Search for Meta Weapons
     * Usage: getMeta("Kogot") -> Returns full data including code/image
     */
    async getMeta(query) {
        const data = await this._getData('meta', () => browserAdapter.getWZMeta());
        if (!data) return "❌ Intel Error: Satellite Offline.";

        const q = query.toLowerCase();

        // 1. Search in Absolute Meta
        let found = data.absolute_meta.find(w => w.name.toLowerCase().includes(q));

        // 2. Search in broader list
        if (!found) {
            for (const category of data.meta) {
                const match = category.weapons.find(w => w.name.toLowerCase().includes(q));
                if (match) {
                    found = match;
                    break;
                }
            }
        }

        if (found) {
            return this._formatWeaponResponse(found);
        } else {
            // Return top 5 as fallback
            const top5 = data.absolute_meta.slice(0, 5).map(w => w.name).join(', ');
            return `לא מצאתי את "${query}".\n👑 **החזקים ביותר כרגע:** ${top5}`;
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
        if (clean.includes('meta') || clean.includes('loadout') || clean.includes('build') || clean.includes('class') || clean.includes('קוד') || clean.includes('נשק')) {
            // Extract weapon name (remove keywords)
            const weapon = clean.replace(/meta|loadout|build|class|קוד|נשק/g, '').trim();
            if (weapon.length > 2) { // Avoid answering just "meta"
                return await this.getMeta(weapon);
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
