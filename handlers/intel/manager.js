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
const weaponCardGraphics = require('../graphics/weaponCard');

class IntelManager {
    // ... constructor ... (implicit)

    // ... initIntel/handlePatchBot ... (implicit)

    async getMeta(query) {
        let result = null;
        let q = query.toLowerCase().trim();

        // 1. Try COD (Priority)
        // Only run COD search if NOT specifically asking for BF6
        if (!q.includes('bf6') && !q.includes('batel') && !q.includes('בתאל')) {
            const codData = await this._getData('meta', () => codSource.getMeta());
            const codResult = await codSource.searchWeapon(query, codData);
            if (codResult && (codResult.isWeapon || codResult.weapons)) {
                result = codResult;
            }
        }

        // 2. Try BF6 (Fallback or Explicit)
        // If we found nothing in COD, OR query explicitly asked for BF6
        if (!result) {
            // Mapping for common Hebrew terms to English categories
            if (q.includes('smg') || q.includes('קצר') || q.includes('רובה שיד')) q = 'smg';
            else if (q.includes('sniper') || q.includes('צלף')) q = 'sniper';
            // Default "Meta"
            else if (q.includes('absolute') || q.includes('meta')) q = 'absolute';

            const bf6Result = await bf6Source.getMeta(q);

            if (bf6Result) {
                // Determine if it was a specific weapon search (not list)
                // Since bf6Source.getMeta now always returns { weapons: [], title, isList }
                // We need to check if user asked for a specific single weapon inside

                const singleMatch = bf6Result.weapons.find(w => w.name.toLowerCase() === q);

                if (singleMatch) {
                    result = {
                        text: `🔫 **${singleMatch.name}** (BF6 Setup)`,
                        image: null, // Will be generated
                        weaponData: singleMatch, // Pass full object for renderer
                        isWeapon: true,
                        title: "BF6 META BUILD"
                    };
                } else {
                    // It's a list (Top 4 / Category)
                    result = {
                        text: bf6Source.getFormattedMeta(bf6Result),
                        weapons: bf6Result.weapons,
                        title: bf6Result.title,
                        isList: true
                    };
                }
            }
        }

        // 3. GRAPHICS GENERATION (Unified Pipeline)
        if (result) {
            try {
                // A. Single Weapon Card (New Visuals)
                if (result.isWeapon && (result.weaponData || result.image)) {
                    // Try to construct weapon object if from COD (which has .image) or BF6 (which has .weaponData)
                    const weaponObj = result.weaponData || {
                        name: result.text.split('**')[1] || query, // Fallback name extraction
                        image: result.image,
                        attachments: result.attachments || [] // COD might need adapter here if structure differs
                    };

                    const buffer = await weaponCardGraphics.generateCard(result.title || "META LOADOUT", weaponObj);
                    result.image = buffer;
                }

                // B. List (Meta List)
                else if (result.weapons) {
                    const buffer = await metaListGraphics.generateList(result.title || "META LOADOUTS", result.weapons);
                    result.image = buffer;
                }

            } catch (e) {
                log(`❌ [Intel] Graphics Gen Failed: ${e.message}`);
            }
        }

        return result;
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



    // --- NLP Routing ---

    async handleNaturalQuery(text) {
        // 1. Basic cleaning
        const cleanText = text.replace(/^(שמעון|שימי|shimon),?\s*/i, '').trim();

        // 2. AI Classification
        const classification = await classifier.classify(cleanText);
        const { intent, entity, game } = classification;

        if (classification.confidence < 0.5 && intent === 'GENERAL_CHAT') return null;

        log(`🧠 [Intel] Routing Intent: ${intent} | Entity: ${entity} | Game: ${game}`);

        // 3. Routing Switch (News Stand Logic)
        switch (intent) {
            case 'WEAPON_META':
                if (entity) {
                    return await this.getMeta(entity);
                }
                return await this.getMeta("absolute");

            case 'GAME_UPDATE':
                // INSTANT RESPONDER: Read from DB, never scrape live.
                if (game === 'BF6') {
                    return await this._getCachedUpdate('BF6');
                }
                else if (game === 'NVIDIA' || (entity && entity.toLowerCase().includes('nvidia'))) {
                    return await this._getCachedUpdate('NVIDIA');
                }
                else if (game === 'FC26' || (entity && (entity.includes('FIFA') || entity.includes('FC')))) {
                    return await this._getCachedUpdate('FC26');
                }
                else {
                    // Default to COD
                    return await this._getCachedUpdate('COD');
                }

            case 'DRIVER_UPDATE':
                return await this._getCachedUpdate('NVIDIA');

            case 'PLAYLIST_INFO':
                return await this.getPlaylists();

            case 'GENERAL_CHAT':
            default:
                return null;
        }
    }

    // --- Automated News Cycle (The background worker) ---
    async checkNews() {
        try {
            log('🕵️ [Intel] Checking for fresh intel (Background)...');
            const statusRef = db.collection('system_metadata').doc('intel_status');
            const statusDoc = await statusRef.get();
            const status = statusDoc.exists ? statusDoc.data() : {};

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
                // 1. Scrape (Silent, background, can fail without user knowing)
                let item = null;
                try {
                    item = await check.source[check.method]();
                } catch (e) {
                    log(`⚠️ [Intel] Background scrape failed for ${check.type}: ${e.message}`);
                    continue;
                }

                if (!item || typeof item === 'string') continue;

                const updateTime = new Date(item.date).getTime();
                const now = Date.now();

                // 2. Change Detection
                let isNew = false;
                const lastTitle = status[check.titleKey];
                const lastDate = status[check.dateKey];

                if (!lastTitle && !lastDate) {
                    // First run logic: Treat as new to populate cache, but maybe skip broadcast?
                    // Let's populate cache so "What is new?" works immediately.
                    isNew = true;
                    log(`🛡️ [Intel] First run for ${check.type}. Populating cache.`);
                } else if (check.checkType === 'title' && item.title !== lastTitle) {
                    isNew = true;
                } else if (check.checkType === 'date') {
                    const savedTime = new Date(lastDate || 0).getTime();
                    if (updateTime > savedTime) isNew = true;
                }

                // Force Update Cache if data is missing but unchanged? 
                // Useful if cache was deleted but metadata exists. 
                // For now, only update on NEW or First Run.

                if (isNew) {
                    log(`🚨 [Intel] NEW ${check.type} DETECTED: ${item.title}`);

                    // 3. ENRICH (Here, in background, where time doesn't matter)
                    const enrichedItem = await enricher.enrich(item, "summary");

                    // 4. SAVE TO CACHE ( The News Stand )
                    await db.collection('intel_cache').doc(check.type).set(enrichedItem);

                    // 5. Broadcast
                    await broadcaster.broadcast(enrichedItem, this.clients);

                    // 6. Update Status
                    await statusRef.set({
                        [check.dateKey]: item.date,
                        [check.titleKey]: item.title
                    }, { merge: true });
                }
            }

        } catch (e) {
            log(`❌ [Intel] News Cycle Failed: ${e.message}`);
        }
    }

    // --- Helper: Read from Cache ---
    async _getCachedUpdate(type) {
        try {
            const doc = await db.collection('intel_cache').doc(type).get();
            if (!doc.exists) {
                return `❎ עדיין לא אספתי מידע על ${type}. נסה שוב בעוד שעה (אני בדיוק בודק).`;
            }
            return doc.data();
        } catch (e) {
            log(`❌ [Intel] Cache Read Error: ${e.message}`);
            return "❌ תקלה בשליפת המידע מהזיכרון.";
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
