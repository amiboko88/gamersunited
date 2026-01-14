const axios = require('axios');
const { log } = require('../../utils/logger');
let codApi;
try {
    const lib = require('call-of-duty-api');
    codApi = lib.default || lib;
} catch (e) {
    log('⚠️ [COD] Module not found or failed to load.');
}

const { COD_SSO_COOKIE } = require('../../config/secrets');

class CODHandler {
    constructor() {
        this.isLoggedIn = false;
    }

    async login() {
        if (this.isLoggedIn) return true;
        if (!codApi) return false;

        try {
            log('[COD] 🔌 Connecting to Activision Services...');

            // Strategic Login Attempt (Versatile)
            // 1. Try standard login() with cookie (some versions overload this)
            if (typeof codApi.login === 'function') {
                try {
                    await codApi.login(COD_SSO_COOKIE);
                    this.isLoggedIn = true;
                    log('✅ [COD] Logged in via standard login()');
                    return true;
                } catch (e) {
                    log(`⚠️ [COD] standard login() failed: ${e.message}`);
                }
            }

            // 2. Try generic "loginWithSSO" if it exists (wrapper variations)
            if (typeof codApi.loginWithSSO === 'function') {
                try {
                    await codApi.loginWithSSO(COD_SSO_COOKIE);
                    this.isLoggedIn = true;
                    return true;
                } catch (e) { log(`⚠️ [COD] loginWithSSO failed.`); }
            }

            log('❌ [COD] All login methods failed. Trying to proceed anyway (State persistence?)...');
            return true;

        } catch (error) {
            log(`❌ [COD] Login Flow Error: ${error.message}`);
            return false;
        }
    }

    /**
     * Fallback: Fetch stats directly via Axios using the API endpoints
     * Bypasses the wrapper library if it is broken.
     */
    async getStatsDirect(gamertag, platform) {
        try {
            const encodedTag = encodeURIComponent(gamertag);

            // Expanded Target List based on community reverse-engineering
            const targets = [
                { title: 'bo6', type: 'wz', name: 'BO6 Warzone' },
                { title: 'bo6', type: 'mp', name: 'BO6 Multiplayer' },
                { title: 'mw', type: 'wz', name: 'Legacy Warzone' },
                { title: 't10', type: 'wz', name: 'T10 Dev BO6' } // Alternative internal name
            ];

            // 1. Force 'uno' platform for Activision IDs with hash (User#123)
            // 'acti' is sometimes valid, but 'uno' is the internal Universal ID platform.
            let platformsToTest = [platform];
            if (gamertag.includes('#') && platform !== 'uno') {
                platformsToTest.push('uno');
            }

            for (const p of platformsToTest) {
                for (const t of targets) {
                    const url = `https://my.callofduty.com/api/papi-client/stats/cod/v1/title/${t.title}/platform/${p}/gamer/${encodedTag}/profile/type/${t.type}`;

                    log(`📡 [COD Direct] Fetching ${t.name} (${p}): ${url}`);

                    try {
                        const response = await axios.get(url, {
                            headers: {
                                'Cookie': `ACT_SSO_COOKIE=${COD_SSO_COOKIE};`,
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Referer': 'https://my.callofduty.com/',
                                'Origin': 'https://my.callofduty.com'
                            },
                            timeout: 5000 // Anti-hang
                        });

                        // Check content type
                        const isJson = response.headers['content-type']?.includes('application/json');

                        // Strict success check
                        if (response.data && response.data.status === 'success' && response.data.data) {
                            log(`✅ [COD Direct] Found stats in ${t.name} on ${p}!`);
                            response.data.data._sourceTitle = t.title;
                            response.data.data._sourceType = t.type;
                            return response.data.data;
                        } else {
                            if (isJson) {
                                // If it's valid JSON but success is false
                                const msg = response.data.data?.message || 'Unknown API Error';
                                log(`⚠️ [COD Direct] API Error (${t.name}): ${msg}`);
                            } else {
                                // HTML? Cloudflare?
                                const preview = response.data.toString().substring(0, 50);
                                log(`⚠️ [COD Direct] Non-JSON Response (${t.name}): "${preview}..."`);
                            }
                        }
                    } catch (innerError) {
                        const status = innerError.response?.status;
                        log(`⚠️ [COD Direct] Failed ${t.name} (${p}): Status ${status}`);
                    }
                }
            }

            log(`❌ [COD Direct] Exhausted all endpoints.`);
            return null;

        } catch (error) {
            log(`❌ [COD Direct] Fatal Error: ${error.message}`);
            return null;
        }
    }

    async getWarzoneStats(gamertag, platform = 'battle') {
        // מנסים להתחבר
        await this.login();

        const cleanTag = gamertag.trim();

        // קריאה ישירה (המנגנון החדש)
        const directData = await this.getStatsDirect(cleanTag, platform);
        if (directData) {
            return this.formatStats(directData, cleanTag);
        }

        return null;
    }

    /**
     * Get the most recent match for a player
     */
    async getRecentMatch(gamertag, platform = 'battle') {
        if (!await this.login()) return null;
        try {
            const cleanTag = gamertag.trim();
            log(`🔍 [COD] Fetching history for: ${cleanTag}...`);
            const data = await codApi.Warzone.combatHistory(cleanTag, platform);

            if (!data || !data.data || !data.data.matches || data.data.matches.length === 0) {
                return null;
            }

            const lastMatch = data.data.matches[0];
            return {
                map: lastMatch.map,
                mode: lastMatch.mode,
                kdRatio: lastMatch.playerStats.kdRatio.toFixed(2),
                kills: lastMatch.playerStats.kills,
                deaths: lastMatch.playerStats.deaths,
                damage: lastMatch.playerStats.damageDone,
                placement: lastMatch.playerStats.teamPlacement,
                time: new Date(lastMatch.utcStartSeconds * 1000).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
            };

        } catch (error) {
            log(`❌ [COD] History Error: ${error.message}`);
            return null;
        }
    }

    formatStats(data, gamertag) {
        // חילוץ נתונים מותאם ל-BO6 או WZ
        const isBO6 = data._sourceTitle === 'bo6' || data._sourceTitle === 't10';
        const gameType = (isBO6 && data._sourceType === 'wz') ? 'BO6 Warzone' :
            isBO6 ? 'Black Ops 6' : 'Warzone (Legacy)';

        // נתונים כלליים - עשוי להשתנות בין API ל-API
        const lifetime = data.lifetime?.mode?.br?.properties ||
            data.lifetime?.mode?.resurgence?.properties ||
            data.lifetime?.all?.properties || {};

        return {
            username: gamertag.split('#')[0],
            game: gameType,
            kdRatio: (lifetime.kdRatio || 0).toFixed(2),
            kills: (lifetime.kills || 0),
            deaths: (lifetime.deaths || 0),
            wins: (lifetime.wins || 0),
            gamesPlayed: (lifetime.gamesPlayed || 0),
            timePlayed: ((lifetime.timePlayed || 0) / 3600).toFixed(1) + 'h'
        };
    }
}

module.exports = new CODHandler();
