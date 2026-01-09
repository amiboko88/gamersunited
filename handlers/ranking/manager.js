// 📁 handlers/ranking/manager.js
const cron = require('node-cron');
const rankingCore = require('./core');
const rankingRenderer = require('./render');
const rankingBroadcaster = require('./broadcaster');
const { log } = require('../../utils/logger');
const { getWeekNumber } = require('../../whatsapp/utils/timeHandler'); // שימוש בפונקציה הקיימת אם יש, או לוגיקה מקומית

class RankingManager {
    constructor() {
        this.clients = {};
    }

    init(discordClient, waSock, waGroupId, telegramBot) {
        this.clients = { discord: discordClient, whatsapp: waSock, waGroupId, telegram: telegramBot };

        // תזמון: יום שבת (6) בשעה 20:00
        cron.schedule('0 20 * * 6', async () => {
            log('⏰ Starting Weekly Leaderboard Automation...');
            await this.runWeeklyProcess();
        }, {
            timezone: "Asia/Jerusalem"
        });

        log('[RankingManager] ✅ מודול דירוג אוטומטי נטען (שבת 20:00).');
    }

    async runWeeklyProcess() {
        try {
            // 1. שליפת נתונים
            const leaders = await rankingCore.getWeeklyLeaderboard(10);
            if (!leaders || leaders.length === 0) {
                log('⚠️ Weekly Leaderboard: No data found via Automation.');
                return;
            }

            // 2. חישוב שבוע
            let weekNum = 1;
            try {
                // לוגיקה פשוטה לחישוב שבוע אם ה-Utils לא זמין
                const d = new Date();
                const startDate = new Date(d.getFullYear(), 0, 1);
                const days = Math.floor((d - startDate) / (24 * 60 * 60 * 1000));
                weekNum = Math.ceil(days / 7);
            } catch (e) {}

            // 3. יצירת תמונה
            const imageBuffer = await rankingRenderer.generateLeaderboardImage(leaders, weekNum);

            // 4. הפצה אוטומטית
            await rankingBroadcaster.broadcastAll(imageBuffer, weekNum, this.clients);
            
            log('✅ Weekly Leaderboard Distributed Successfully!');

        } catch (error) {
            log(`❌ Weekly Leaderboard Error: ${error.message}`);
        }
    }
}

module.exports = new RankingManager();