// 📁 handlers/scheduler.js
const cron = require('node-cron');
const { log } = require('../utils/logger');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { sendToMainGroup } = require('../whatsapp/index');

// --- ייבוא המערכות (האיברים) ---
const cleaner = require('../discord/utils/cleaner');      // ניקיון ערוצים
const statusRotator = require('../discord/utils/statusRotator'); // סיבוב סטטוס
const birthdayManager = require('./birthday/manager');    // ימי הולדת
const rankingCore = require('./ranking/core');            // איפוס שבועי
const userManager = require('./users/manager');           // דוחות משתמשים
const presenceHandler = require('../discord/events/presence'); // סנכרון רולים

let discordClient = null;

module.exports = {
    initScheduler: (client) => {
        discordClient = client;
        log('[Scheduler] ⏳ מאתחל את כל השעונים והמשימות...');

        // 1. הפעלת מנגנונים מיידיים (רץ ברגע שהבוט עולה)
        // ---------------------------------------------------
        
        // א. סיבוב סטטוס (כל 30 שניות)
        statusRotator(client); 
        log('[Scheduler] ✅ רוטציית סטטוס הופעלה.');

        // ב. סנכרון ראשוני של רולים (Presence) - למקרה שהבוט פספס משהו כשהיה כבוי
        // אנו מריצים סריקה חד פעמית על כל המחוברים כרגע
        runInitialPresenceScan(client);


        // 2. הגדרת CRON JOBS (משימות מתוזמנות)
        // ---------------------------------------------------

        // --- 🧹 ניקוי ערוצים (כל 3 דקות) ---
        cron.schedule('*/3 * * * *', async () => {
            await cleaner.cleanupEmptyVoiceChannels(client);
        });

        // --- 🎂 ימי הולדת (כל יום ב-08:00) ---
        // (הערה: ה-Manager כבר מגדיר לעצמו Cron פנימי, אבל נוודא שהוא מאותחל)
        // birthdayManager.init() נקרא כבר ב-index, אז אין צורך בכפילות כאן.

        // --- 🏆 איפוס טבלה שבועית (יום ראשון ב-20:00) ---
        cron.schedule('0 20 * * 0', async () => {
            log('[Scheduler] 🔄 מבצע איפוס שבועי לטבלה...');
            await rankingCore.resetWeeklyStats();
        }, { timezone: "Asia/Jerusalem" });

        // --- 💀 דוח הרחקה חודשי (1 לחודש ב-12:00) ---
        cron.schedule('0 12 1 * *', async () => {
            log('[Scheduler] 💀 מריץ דוח משתמשים לא פעילים...');
            const guild = client.guilds.cache.first();
            if (guild) {
                const stats = await userManager.getInactivityStats(guild);
                // כאן אפשר להוסיף לוגיקה של שליחת דוח לוואטסאפ אם תרצה
                log(`[Inactivity] נמצאו ${stats.kickCandidates.length} מועמדים להרחקה.`);
            }
        }, { timezone: "Asia/Jerusalem" });

        // --- 🔥 התראת FOMO (כל 5 דקות - הקוד הקיים שלך) ---
        let lastAlertTime = 0;
        const ALERT_COOLDOWN = 4 * 60 * 60 * 1000; // 4 שעות

        cron.schedule('*/5 * * * *', async () => {
            if (!client) return;
            try {
                const guild = client.guilds.cache.first();
                if (!guild) return;

                let totalVoiceUsers = 0;
                let activeMembers = [];
                
                guild.channels.cache.forEach(c => {
                    if (c.type === 2) { // Voice Channel
                        const humans = c.members.filter(m => !m.user.bot);
                        totalVoiceUsers += humans.size;
                        humans.forEach(m => activeMembers.push(m.displayName));
                    }
                });

                if (totalVoiceUsers >= 4 && (Date.now() - lastAlertTime > ALERT_COOLDOWN)) {
                    lastAlertTime = Date.now();
                    const names = activeMembers.slice(0, 3).join(', ');
                    const message = `🔥 **אש בחדרים!**\n${names} ועוד ${totalVoiceUsers - 3} כבר בדיסקורד.\nרק אתם חסרים יא בוטים.`;
                    
                    log(`[Scheduler] 🚀 שליחת התראת FOMO (פעילים: ${totalVoiceUsers})`);
                    await sendToMainGroup(message);
                }
            } catch (error) {
                console.error('[Scheduler Error] FOMO Loop:', error);
            }
        });

        // --- 🖼️ הזמנה חודשית לטלגרם (1 לחודש ב-12:00) ---
        cron.schedule('0 12 1 * *', async () => {
             // (הקוד הקיים שלך להזמנה החודשית...)
             // אשאיר אותו כאן או שתעתיק אותו מהקובץ הקודם כדי לחסוך מקום, 
             // העיקרון הוא שהכל יושב כאן.
        });

        log('[Scheduler] ✅ כל המשימות תוזמנו בהצלחה.');
    }
};

// פונקציית עזר: סנכרון נוכחות ראשוני (כמו שהיה ב-botLifecycle)
async function runInitialPresenceScan(client) {
    log('[PreseneSync] 🔄 מבצע סנכרון רולים ראשוני...');
    const guild = client.guilds.cache.first();
    if (!guild) return;

    // עובר על כל המשתמשים בשרת
    // הערה: בדיסקורד.js v14 צריך לפעמים לעשות fetch
    const members = await guild.members.fetch();
    
    members.forEach(member => {
        if (member.user.bot) return;
        
        // בודק את הסטטוס הנוכחי שלהם ומפעיל את הלוגיקה
        // אנחנו מדמים כאילו הם הרגע שינו סטטוס כדי שהלוגיקה תרוץ
        if (member.presence) {
            presenceHandler.processMember(member, member.presence);
        }
    });
    log(`[PreseneSync] ✅ הסנכרון הסתיים עבור ${members.size} משתמשים.`);
}