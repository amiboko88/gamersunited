const axios = require('axios');
const { log } = require('../../utils/logger');
let codApi;
try {
    const lib = require('call-of-duty-api');
    codApi = lib.default || lib;
} catch (e) {
    log('⚠️ [COD] Module not found or failed to load.');
}

// בדיקה מהירה אם זה מחלקה או אובייקט עם פונקציות
if (codApi && typeof codApi === 'function') {
    log(`🐛 [COD Debug] Module is a function/class.`);
} else if (codApi) {
    log(`🐛 [COD Debug] Available methods: ${Object.keys(codApi).join(', ')}`);
    if (codApi.Warzone) {
        log(`🐛 [COD Debug] Warzone methods: ${Object.keys(codApi.Warzone).join(', ')}`);
    }
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

            // 3. Fallback: Assume we might be logged in if the library state is retained
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
            // מנסים את ה-Endpoint של Modern Warfare (מכסה את Warzone)
            const url = `https://my.callofduty.com/api/papi-client/stats/cod/v1/title/mw/platform/${platform}/gamer/${encodedTag}/profile/type/wz`;

            log(`📡 [COD Direct] Fetching: ${url}`);

            const response = await axios.get(url, {
                headers: {
                    'Cookie': `ACT_SSO_COOKIE=${COD_SSO_COOKIE};`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://my.callofduty.com/'
                }
            });

            if (response.data && response.data.status === 'success') {
                log('✅ [COD Direct] Success!');
                return response.data.data;
            } else {
                log(`⚠️ [COD Direct] API status: ${response.data?.status} | Msg: ${JSON.stringify(response.data?.data)}`);
                return null;
            }
        } catch (error) {
            log(`❌ [COD Direct] HTTP Error: ${error.message} (Status: ${error.response?.status})`);
            return null;
        }
    }

    async getWarzoneStats(gamertag, platform = 'battle') {
        // מנסים להתחבר, מקסימום נכשל
        await this.login();

        const cleanTag = gamertag.trim();
        const platformsToTry = [platform];

        // לוגיקה חכמה: רוטציית פלטפורמות
        if (platform === 'battle') {
            platformsToTry.push('acti'); // For Activision IDs
            platformsToTry.push('uno');
        }
        if (platform === 'acti' || platform === 'uno') platformsToTry.push('battle');

        for (const p of platformsToTry) {
            try {
                // קודם כל ננסה את הדרך הישירה (יותר אמינה כרגע)
                const directData = await this.getStatsDirect(cleanTag, p);
                if (directData) {
                    return this.formatStats(directData, cleanTag);
                }

                // אם נכשל, ננסה את הספרייה (אולי)
                log(`🔍 [COD] Searching stats via Wrapper for: ${cleanTag} on ${p}...`);
                const data = await codApi.Warzone.fullData(cleanTag, p);

                if (data && data.data) {
                    return this.formatStats(data.data, cleanTag);
                }
            } catch (error) {
                // התעלמות משגיאות ביניים
            }
        }

        log(`❌ [COD] No data found for ${cleanTag} on any platform.`);
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

            // המשחק האחרון
            const lastMatch = data.data.matches[0];
            return {
                map: lastMatch.map, // e.g., "wz_s1_resurgence"
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
        // חילוץ נתונים רלוונטיים (Resurgence / BR)
        const weekly = data.weekly?.mode?.resurgence?.properties || {};
        const lifetime = data.lifetime?.mode?.resurgence?.properties || {};
        const allModes = data.lifetime?.all?.properties || {};

        return {
            username: gamertag.split('#')[0],
            kdRatio: (lifetime.kdRatio || allModes.kdRatio || 0).toFixed(2),
            kills: (lifetime.kills || allModes.kills || 0),
            deaths: (lifetime.deaths || allModes.deaths || 0),
            wins: (lifetime.wins || allModes.wins || 0),
            gamesPlayed: (lifetime.gamesPlayed || allModes.gamesPlayed || 0),
            timePlayed: ((lifetime.timePlayed || allModes.timePlayed || 0) / 3600).toFixed(1) + 'h'
        };
    }
}

module.exports = new CODHandler();
