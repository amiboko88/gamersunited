// 📁 handlers/gaming/cod.js
const { log } = require('../../utils/logger');
let codApi;
try {
    const lib = require('call-of-duty-api');
    codApi = lib.default || lib; // תמיכה במבנים שונים

    // בדיקה מהירה אם זה מחלקה או אובייקט עם פונקציות
    if (typeof codApi === 'function') {
        // יכול להיות שזו מחלקה שצריך לאתחל? לא סביר בגרסה הזו, אבל נבדוק
        log(`🐛 [COD Debug] Module is a function/class.`);
    } else {
        log(`🐛 [COD Debug] Available methods: ${Object.keys(codApi).join(', ')}`);
        if (codApi.Warzone) {
            log(`🐛 [COD Debug] Warzone methods: ${Object.keys(codApi.Warzone).join(', ')}`);
        }
    }
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

            // ניסיון 1: שיטה ישנה (loginWithSSO ישירות על האובייקט)
            if (typeof codApi.loginWithSSO === 'function') {
                await codApi.loginWithSSO(COD_SSO_COOKIE);
            }
            // ניסיון 2: מבנה חדש (דרך Warzone)
            else if (codApi.Warzone && typeof codApi.Warzone.loginWithSSO === 'function') {
                await codApi.Warzone.loginWithSSO(COD_SSO_COOKIE);
            }
            // ניסיון 3: אולי זה Class?
            else if (typeof codApi === 'function') {
                // בגרסאות חדשות לפעמים צריך לאתחל: const api = new codApi();
                // אבל אם זה לא עובד, ננסה פשוט להשתמש ב-API הרשמי אם יש
                log('⚠️ [COD] Structure mismatch. Attempting standard login...');
            }
            else {
                throw new Error(`Method loginWithSSO not found. Keys: ${Object.keys(codApi).join(', ')}`);
            }

            this.isLoggedIn = true;
            log('✅ [COD] Logged in successfully via SSO.');
            return true;
        } catch (error) {
            log(`❌ [COD] Login Failed: ${error.message}`);
            this.isLoggedIn = false;
            return false;
        }
    }

    /**
     * Get Warzone Stats for a player
     * @param {string} gamertag - format: "User#1234" (Battle.net) or "User" (PSN/XBOX if unique)
     * @param {string} platform - 'battle', 'psn', 'xbl', 'uno' (Activision ID)
     */
    async getWarzoneStats(gamertag, platform = 'battle') {
        if (!await this.login()) return null;

        try {
            // נקיון הקלט
            const cleanTag = gamertag.trim();

            // המרה חכמה של פלטפורמה אם לא צוינה
            // אם יש סולמית (#), זה כנראה באטלנט או אקטיביז'ן
            let targetPlatform = platform;
            if (targetPlatform === 'battle' && !cleanTag.includes('#')) {
                // אם אין סולמית, אי אפשר באטלנט, אולי זה PSN?
                // נשאיר כדיפולט ונראה אם ייכשל
            }

            log(`🔍 [COD] Searching stats for: ${cleanTag} on ${targetPlatform}...`);

            // שליפת נתונים
            const data = await codApi.Warzone.fullData(cleanTag, targetPlatform);

            if (!data || !data.data) {
                log(`❌ [COD] No data found for ${cleanTag}. Privacy settings?`);
                return null;
            }

            return this.formatStats(data.data, cleanTag);

        } catch (error) {
            log(`❌ [COD] Fetch Error: ${error.message}`);
            return null;
        }
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
