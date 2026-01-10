// 📁 handlers/ranking/manager.js
const cron = require('node-cron');
const db = require('../../utils/firebase'); // ✅ חיבור ל-DB
const rankingCore = require('./core');
const rankingRenderer = require('./render');
const rankingBroadcaster = require('./broadcaster');
const { log } = require('../../utils/logger');
// וודא שיש לך את הקובץ הזה, או שתשתמש בפונקציית העזר למטה
const { getWeekNumber } = require('../../whatsapp/utils/timeHandler'); 

// רפרנס למסמך ששומר את ה-ID של ההודעה
const META_REF = db.collection('system_metadata').doc('weeklyLeaderboard');

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

    /**
     * פונקציה להרצה ידנית (לבדיקות או אם פספסנו)
     */
    async forceRun() {
        log('⚠️ Force running Weekly Leaderboard...');
        await this.runWeeklyProcess();
    }

    async runWeeklyProcess() {
        try {
            log('📊 מחשב לידרבורד שבועי...');
            
            // 1. שליפת נתונים
            const leaders = await rankingCore.getWeeklyLeaderboard(10);
            if (!leaders || leaders.length === 0) {
                log('⚠️ Weekly Leaderboard: No data found (Empty).');
                return;
            }

            // 2. חישוב שבוע (נקי ומסודר)
            const weekNum = getWeekNumber ? getWeekNumber() : this._fallbackWeekCalc();

            // 3. יצירת תמונה (הטבלה המשתנה)
            log(`🎨 מייצר תמונה לשבוע #${weekNum}...`);
            const imageBuffer = await rankingRenderer.generateLeaderboardImage(leaders, weekNum);

            // 4. שליפת ה-ID האחרון מה-DB
            let lastMessageId = null;
            const metaDoc = await META_REF.get();
            if (metaDoc.exists) {
                lastMessageId = metaDoc.data().messageId;
            }

            // 5. הפצה (ה-Broadcaster יחזיר את ה-ID החדש/הקיים)
            const newMessageId = await rankingBroadcaster.broadcastDiscord(
                this.clients.discord, 
                imageBuffer, 
                weekNum, 
                lastMessageId
            );

            // 6. הפצה לשאר הפלטפורמות (ללא עריכה, תמיד חדש)
            await rankingBroadcaster.broadcastOthers(this.clients, imageBuffer, weekNum);

            // 7. עדכון ה-DB ב-ID העדכני
            if (newMessageId) {
                await META_REF.set({ 
                    messageId: newMessageId,
                    lastUpdate: new Date().toISOString(),
                    week: weekNum
                }, { merge: true });
                log(`✅ DB עודכן עם Message ID: ${newMessageId}`);
            }

        } catch (error) {
            log(`❌ Weekly Leaderboard Error: ${error.message}`);
            console.error(error);
        }
    }

    // גיבוי למקרה שהפונקציה החיצונית לא קיימת
    _fallbackWeekCalc() {
        const d = new Date();
        const startDate = new Date(d.getFullYear(), 0, 1);
        const days = Math.floor((d - startDate) / (24 * 60 * 60 * 1000));
        return Math.ceil(days / 7);
    }
}

module.exports = new RankingManager();