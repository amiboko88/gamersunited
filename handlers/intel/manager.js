const codSource = require('./sources/cod');
const bf6Source = require('./sources/bf6');
const nvidiaSource = require('./sources/nvidia');
const fc26Source = require('./sources/fc26');

const broadcaster = require('./services/broadcaster');
const enricher = require('./services/enricher');
const classifier = require('./services/classifier');

const { log } = require('../../utils/logger');
const db = require('../../utils/firebase');

const CACHE_TTL = 60 * 60 * 1000; // 1 Hour Cache
const metaListGraphics = require('../graphics/metaList');

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

    // --- PatchBot Event Listener (Event-Driven Updates) ---
    async handlePatchBot(msg) {
        try {
            // 1. Validate Source & Content
            const PATCHBOT_CHANNEL = '1016291126992437268';
            if (msg.channel.id !== PATCHBOT_CHANNEL) return;

            if (msg.embeds.length === 0) return; // Second message usually has no embed or just image
            const embed = msg.embeds[0];
            const title = embed.title || embed.author?.name || "";
            const rawUrl = embed.url || (embed.description && embed.description.match(/https:\/\/patchbot\.io\/click\/[a-zA-Z0-9%\-_]+/)?.[0]);

            log(`🕵️ [Intel] PatchBot Message Detected! Title: "${title}"`);

            // 2. Filter Relevant Games
            // "Battlefield 6", "NVIDIA GeForce Driver", "Call of Duty", "EA SPORTS FC"
            let type = null;
            if (title.includes('Battlefield 6')) type = 'BF6';
            else if (title.includes('NVIDIA') || title.includes('GeForce')) type = 'NVIDIA';
            else if (title.includes('Call of Duty') || title.includes('Warzone')) type = 'COD';
            else if (title.includes('EA SPORTS FC') || title.includes('FIFA')) type = 'FC26';

            if (!type) {
                log(`🕵️ [Intel] Ignoring PatchBot Update for: "${title}" (Not in Watchlist)`);
                return;
            }

            if (!rawUrl) {
                log(`⚠️ [Intel] PatchBot Update (${type}) detected but NO LINK found.`);
                return;
            }

            log(`🚨 [Intel] Processing NEW ${type} Update from PatchBot...`);

            // 3. Construct Item
            const item = {
                title: `${type} UPDATE: ${title}`,
                link: rawUrl, // Browser/Enricher will handle the redirect
                date: new Date().toISOString(),
                summary: embed.description || "New Update Available."
            };

            // 4. Enrich & Summarize (Translation + Smart Summary)
            // We force enrichment because this is a CONFIRMED update event
            const enrichedItem = await enricher.enrich(item, "summary"); // "summary" triggers default prompt

            // 5. Broadcast
            await broadcaster.broadcast(enrichedItem, this.clients);
            log(`✅ [Intel] Successfully Broadcasted ${type} Update.`);

        } catch (error) {
            log(`❌ [Intel] PatchBot Handler Error: ${error.message}`);
        }
    }

    // --- Core Data Fetchers (Delegated) ---

    async getMeta(query) {
        let result = null;

        // 1. Try COD (Priority)
        const codData = await this._getData('meta', () => codSource.getMeta());
        const codResult = await codSource.searchWeapon(query, codData);

        if (codResult && (codResult.isWeapon || codResult.weapons)) {
            result = codResult;
        }

        // 2. Try BF6 (Fallback) if no result yet
        if (!result) {
            const bf6Data = await this._getData('bf6', () => bf6Source.getMeta());

            if (bf6Data && Array.isArray(bf6Data)) {
                const q = query.toLowerCase().trim();
                const genericTerms = ['absolute', 'meta', 'מטא', 'מטה', 'הכי חזק', 'נשק', 'רובה', 'טוב'];

                // A. Generic Request -> Return Top 5 LIST
                if (genericTerms.some(t => q === t || (t.length > 3 && q.includes(t)))) {
                    result = {
                        text: bf6Source.getFormattedMeta(bf6Data),
                        isWeapon: true,
                        weapons: bf6Data.slice(0, 5), // Expose for graphics
                        title: "BATTLEFIELD 6 / META"
                    };
                }
                // B. Specific Search
                else {
                    const found = bf6Data.find(w => w.name.toLowerCase().includes(q));
                    if (found) {
                        result = {
                            text: `🔫 **${found.name}** (BF6)\n\n${found.attachments.map(a => `• ${a.part}: ${a.name}`).join('\n')}`,
                            image: found.image,
                            isWeapon: true
                        };
                    }
                }
            }
        }

        // 3. GRAPHICS GENERATION (The Visual Upgrade)
        if (result && result.weapons) {
            try {
                const buffer = await metaListGraphics.generateList(result.title || "META LOADOUTS", result.weapons);
                result.image = buffer; // Assign buffer to be sent as image
                // result.text can remain as caption
            } catch (e) {
                log(`❌ [Intel] Graphics Gen Failed: ${e.message}`);
                // Fallback to text (result.text is already there)
            }
        }

        return result || codResult; // Return whatever we found (or the original failure/text from generic search)
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
        return `🚨 **${update.title}**\n📅 ${new Date(update.date).toLocaleDateString('he-IL')}\n\n${update.summary}`;
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
        // 1. Basic cleaning (remove "Shimon" trigger word, keep the rest raw)
        const cleanText = text.replace(/^(שמעון|שימי|shimon),?\s*/i, '').trim();

        // 2. AI Classification
        const classification = await classifier.classify(cleanText);
        const { intent, entity, game } = classification;

        if (classification.confidence < 0.5 && intent === 'GENERAL_CHAT') return null;

        log(`🧠 [Intel] Routing Intent: ${intent} | Entity: ${entity} | Game: ${game}`);

        // 3. Routing Switch
        switch (intent) {
            case 'WEAPON_META':
                if (entity) {
                    return await this.getMeta(entity); // getMeta handles "absolute" internally if entity is "meta"
                }
                return await this.getMeta("absolute");

            case 'GAME_UPDATE':
                if (game === 'BF6') {
                    const updates = await bf6Source.getUpdates();
                    if (updates && updates.link) return await enricher.enrich(updates, text);
                    return "❌ No recent BF6 updates found.";
                } else if (game === 'NVIDIA' || (entity && entity.toLowerCase().includes('nvidia'))) {
                    const updates = await nvidiaSource.getUpdates();
                    if (updates && updates.link) return await enricher.enrich(updates, text);
                    return nvidiaSource.formatUpdate(updates);
                } else if (game === 'FC26' || (entity && (entity.includes('FIFA') || entity.includes('FC')))) {
                    const updates = await fc26Source.getUpdates();
                    if (updates && updates.link) return await enricher.enrich(updates, text);
                    return fc26Source.formatUpdate(updates);
                } else {
                    // Default to COD / General Update
                    return await this.getLatestNews(text);
                }

            case 'DRIVER_UPDATE':
                const updates = await nvidiaSource.getUpdates();
                if (updates && updates.link) return await enricher.enrich(updates, text);
                return nvidiaSource.formatUpdate(updates);

            case 'PLAYLIST_INFO':
                return await this.getPlaylists();

            case 'GENERAL_CHAT':
            default:
                // Let the Brain handle conversation
                return null;
        }
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
