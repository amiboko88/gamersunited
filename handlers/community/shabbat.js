const axios = require('axios');
const cron = require('node-cron');
const { log } = require('../../utils/logger');
const shabbatCard = require('../graphics/shabbatCard');
const broadcaster = require('../intel/services/broadcaster');

// Hebcal Geoname IDs
const CITIES = {
    TLV: { id: '293397', name: 'תל אביב' },
    JLM: { id: '281184', name: 'ירושלים' },
    HAI: { id: '294801', name: 'חיפה' },
    BS: { id: '295530', name: 'באר שבע' }
};

const BASE_URL = 'https://www.hebcal.com/shabbat?cfg=json&M=on';

const fs = require('fs');
const path = require('path');

class ShabbatManager {
    constructor() {
        this.timers = [];
        this.clients = null;
        this.configPath = path.join(__dirname, 'shabbat_config.json');
        this.currentTimes = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                return JSON.parse(fs.readFileSync(this.configPath));
            }
        } catch (e) { log(`⚠️ [Shabbat] Config Load Error: ${e.message}`); }
        return null;
    }

    saveConfig(times) {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(times));
            this.currentTimes = times;
        } catch (e) { log(`⚠️ [Shabbat] Config Save Error: ${e.message}`); }
    }

    // Checking Observance (Allow 10 min grace after entry for last replies)
    isShabbat() {
        if (!this.currentTimes) return false;
        const now = new Date();
        const entry = new Date(this.currentTimes.entry);
        const exit = new Date(this.currentTimes.exit);

        // Strict: From Lighting to Havdalah
        return now >= entry && now <= exit;
    }

    init(discordClient, whatsappSock, telegramBot) {
        this.clients = { discord: discordClient, whatsapp: whatsappSock, telegram: telegramBot };

        // Schedule Weekly Fetch (Friday 08:00 AM)
        cron.schedule('0 8 * * 5', () => this.fetchAndSchedule());

        // Startup Check (Friday Recovery)
        const now = new Date();
        if (now.getDay() === 5 && now.getHours() >= 8) {
            log('🕯️ [Shabbat] Startup on Friday detected. Fetching times...');
            this.fetchAndSchedule();
        }

        log('🕯️ [Shabbat] Manager Initialized (Observant Mode 🕎). System is: ' + (this.isShabbat() ? 'RESTING 😴' : 'ACTIVE ✅'));
    }

    async fetchAndSchedule() {
        try {
            log('🕯️ [Shabbat] Fetching times for all cities...');

            // 1. Fetch Parallel
            const requests = Object.entries(CITIES).map(([key, city]) =>
                axios.get(`${BASE_URL}&geonameid=${city.id}`)
                    .then(res => ({ key, name: city.name, data: res.data }))
            );

            const results = await Promise.all(requests);

            // 2. Extract Data (Focus on TLV for triggers)
            const tlvResult = results.find(r => r.key === 'TLV');
            if (!tlvResult) throw new Error("TLV Data Missing");

            const getCategory = (res, cat) => res.data.items.find(i => i.category === cat);

            // Triggers based on Tel Aviv
            const tlvCandles = getCategory(tlvResult, 'candles');
            const tlvHavdalah = getCategory(tlvResult, 'havdalah');
            const parashaItem = getCategory(tlvResult, 'parashat');

            if (!tlvCandles || !tlvHavdalah) throw new Error("Missing items in response");

            const tlvCandlesTime = new Date(tlvCandles.date);
            const tlvHavdalahTime = new Date(tlvHavdalah.date);

            // SAVE TIMES for Blocking Logic (Exact Candle Time to Exact Havdalah Time)
            this.saveConfig({
                entry: tlvCandlesTime.toISOString(),
                exit: tlvHavdalahTime.toISOString()
            });

            const parashaName = parashaItem ? (parashaItem.hebrew || parashaItem.title) : "פרשת השבוע";

            // Trigger Times (-10 and +10 min)
            const entryTrigger = new Date(tlvCandlesTime.getTime() - 10 * 60000);
            const exitTrigger = new Date(tlvHavdalahTime.getTime() + 10 * 60000);

            // Helper: Format Time HH:MM
            const fmt = (dStr) => {
                const d = new Date(dStr);
                return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
            };

            // 3. Build Objects for Graphics
            const extractCityTime = (key, cat) => {
                const res = results.find(r => r.key === key);
                const item = getCategory(res, cat);
                return item ? fmt(item.date) : '--:--';
            };

            // Cities List (excluding TLV which is main)
            const otherCitiesEntry = [
                { name: 'ירושלים', time: extractCityTime('JLM', 'candles') },
                { name: 'חיפה', time: extractCityTime('HAI', 'candles') },
                { name: 'באר שבע', time: extractCityTime('BS', 'candles') }
            ];

            const otherCitiesExit = [
                { name: 'ירושלים', time: extractCityTime('JLM', 'havdalah') },
                { name: 'חיפה', time: extractCityTime('HAI', 'havdalah') },
                { name: 'באר שבע', time: extractCityTime('BS', 'havdalah') }
            ];

            const displayEntry = {
                parasha: parashaName,
                time: fmt(tlvCandles.date), // Main TLV Time
                exitTime: fmt(tlvHavdalah.date), // ✅ Added Exit Time
                cities: otherCitiesEntry
            };

            const displayExit = {
                // For Exit card, we mainly need the custom text, but passing data doesn't hurt
                parasha: parashaName,
                time: fmt(tlvHavdalah.date)
            };

            log(`🕯️ [Shabbat] Schedule Ready. Entry: ${fmt(entryTrigger)}, Exit: ${fmt(exitTrigger)}`);

            this.scheduleEvent(entryTrigger, 'entry', displayEntry);
            this.scheduleEvent(exitTrigger, 'exit', displayExit);

        } catch (e) {
            log(`❌ [Shabbat] Fetch Error: ${e.message}`);
        }
    }

    scheduleEvent(triggerDate, type, data) {
        const now = new Date();
        const delay = triggerDate.getTime() - now.getTime();

        if (delay < 0) {
            log(`⚠️ [Shabbat] Skipping ${type} (Time passed: ${triggerDate.toLocaleTimeString()})`);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                log(`🕯️ [Shabbat] Triggering ${type} notification...`);

                // 🧠 AI Text for Exit Card
                if (type === 'exit') {
                    try {
                        const brain = require('../../ai/brain');
                        // Lazy load brain to avoid circular dep if any
                        const prompt = "כתוב משפט אחד שנון קצר (מקסימום 7 מילים) לגיימרים על חזרה לשגרה במוצאי שבת. בלי 'שבוע טוב'. חייב לכלול אימוג'י אחד לפחות.";
                        const aiText = await brain.generateInternal(prompt); // ✅ Correct method
                        if (aiText) data.customText = aiText;
                    } catch (aiErr) {
                        log(`⚠️ [Shabbat] AI Text Failed: ${aiErr.message}`);
                    }
                }

                const buffer = await shabbatCard.generateCard(type, data);

                const item = {
                    title: type === 'entry' ? "שבת שלום! 🕯️" : "שבוע טוב! 🍷",
                    summary: type === 'entry' ?
                        `שבת שלום לכל קהילת גיימרים יונייטד! 🎮` :
                        `שבוע טוב ומבורך! חוזרים לשחק 🎮`,
                    link: "https://www.hebcal.com",
                    image: buffer,
                    isInternal: true,
                    tagAll: true
                };

                if (broadcaster && broadcaster.broadcast) {
                    await broadcaster.broadcast(item, this.clients);
                }
            } catch (e) {
                log(`❌ [Shabbat] Execution Error: ${e.message}`);
            }
        }, delay);

        this.timers.push(timer);
        log(`✅ [Shabbat] Scheduled ${type} in ${Math.round(delay / 60000)} minutes.`);
    }
}

module.exports = new ShabbatManager();
