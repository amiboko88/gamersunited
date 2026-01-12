// 📁 handlers/ranking/manager.js
const cron = require('node-cron');
const db = require('../../utils/firebase');
const rankingCore = require('./core');
// const rankingRenderer = require('./render'); // ❌ נמחק
const graphics = require('../graphics/index'); // ✅ המערכת הגרפית החדשה
const rankingBroadcaster = require('./broadcaster');
const { log } = require('../../utils/logger');

// רפרנס למסמך ששומר את ה-ID של ההודעה הקבועה לעריכה
const META_REF = db.collection('system_metadata').doc('weeklyLeaderboard');

class RankingManager {
    constructor() {
        this.clients = {};
    }

    /**
     * אתחול המנהל עם כל הקליינטים מה-index.js
     */
    init(discordClient, waSock, waGroupId, telegramBot) {
        this.clients = { 
            discord: discordClient, 
            whatsapp: waSock, 
            waGroupId, 
            telegram: telegramBot 
        };

        // תזמון: בכל מוצ"ש (יום 6) בשעה 20:00
        cron.schedule('0 20 * * 6', async () => {
            log('⏰ [Ranking] Starting Weekly Leaderboard Automation...');
            await this.runWeeklyProcess();
        }, {
            timezone: "Asia/Jerusalem"
        });

        log('[RankingManager] ✅ מודול דירוג אוטומטי נטען (מוצ"ש 20:00).');
    }

    /**
     * פונקציה להרצה ידנית (לבדיקות או אם השרת היה כבוי בזמן הקרון)
     */
    async forceRun() {
        log('⚠️ [Ranking] Force running Weekly Leaderboard...');
        await this.runWeeklyProcess();
    }

    /**
     * התהליך המרכזי: שליפה, רינדור והפצה
     */
    async runWeeklyProcess() {
        try {
            log('📊 [Ranking] מחשב לידרבורד שבועי...');
            
            // 1. שליפת נתוני הטופ 10 מה-DB
            const leaders = await rankingCore.getWeeklyLeaderboard(10);
            if (!leaders || leaders.length === 0) {
                log('⚠️ [Ranking] No data found (Empty). Skipping broadcast.');
                return;
            }

            // 2. חישוב מספר השבוע (מסונכרן לפורמט הפקודה)
            const weekNum = this._getWeekNumber();

            // 3. יצירת התמונה (Puppeteer) דרך המנוע החדש ✅
            log(`🎨 [Ranking] מייצר תמונה לשבוע #${weekNum}...`);
            const imageBuffer = await graphics.leaderboard.generateImage(leaders, weekNum);

            if (!imageBuffer) {
                log('❌ [Ranking] Image generation failed.');
                return;
            }

            // 4. שליפת מזהה ההודעה הקודמת לעריכה מדיסקורד
            let lastMessageId = null;
            const metaDoc = await META_REF.get();
            if (metaDoc.exists) {
                lastMessageId = metaDoc.data().messageId;
            }

            // 5. הפצה לדיסקורד (עריכה חכמה)
            const newMessageId = await rankingBroadcaster.broadcastDiscord(
                this.clients.discord, 
                imageBuffer, 
                weekNum, 
                lastMessageId
            );

            // 6. הפצה לשאר הפלטפורמות (שליחה כהודעה חדשה)
            await rankingBroadcaster.broadcastOthers(this.clients, imageBuffer, weekNum);

            // 7. שמירת המזהה החדש ב-DB לעדכון בשבוע הבא
            if (newMessageId) {
                await META_REF.set({ 
                    messageId: newMessageId,
                    lastUpdate: new Date().toISOString(),
                    week: weekNum
                }, { merge: true });
                log(`✅ [Ranking] המערכת עודכנה ב-DB עם Message ID: ${newMessageId}`);
            }

        } catch (error) {
            log(`❌ [Ranking] Weekly Leaderboard Error: ${error.message}`);
            console.error(error);
        }
    }

    /**
     * פונקציית עזר פנימית לחישוב מספר השבוע
     */
    _getWeekNumber() {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
}

module.exports = new RankingManager();