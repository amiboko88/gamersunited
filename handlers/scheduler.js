// 📁 handlers/scheduler.js
const cron = require('node-cron');
const { log } = require('../utils/logger');
const db = require('../utils/firebase'); // ✅ חובה ל-Cooldown
const { sendToMainGroup } = require('../whatsapp/index');

// --- ייבוא המערכות ---
const rankingCore = require('./ranking/core');      // איפוס שבועי
const userManager = require('./users/manager');     // דוחות משתמשים
const presenceHandler = require('../discord/events/presence'); // סנכרון רולים

const TIMERS_REF = db.collection('system_metadata').doc('timers');

let discordClient = null;

module.exports = {
    initScheduler: (client) => {
        discordClient = client;
        log('[Scheduler] ⏳ מאתחל את המשימות המתוזמנות (Cron Jobs)...');

        // 1. סנכרון ראשוני של רולים (Presence) 
        // למקרה שהבוט פספס משהו כשהיה כבוי
        runInitialPresenceScan(client);

        // 2. הגדרת CRON JOBS (משימות מתוזמנות)
        // ---------------------------------------------------

        // --- 🏆 איפוס טבלה שבועית (מוצ"ש ב-20:05) ---
        // מבצע Snapshot מיד לאחר פרסום הלידרבורד כדי להתחיל לספור שבוע חדש
        cron.schedule('5 20 * * 6', async () => {
            log('[Scheduler] 🔄 מבצע איפוס שבועי (Snapshot) לטבלה...');
            await rankingCore.resetWeeklyStats();
        }, { timezone: "Asia/Jerusalem" });

        // --- 💀 דוח הרחקה חודשי (1 לחודש ב-12:00) ---
        cron.schedule('0 12 1 * *', async () => {
            log('[Scheduler] 💀 מריץ דוח משתמשים לא פעילים...');
            const guild = client.guilds.cache.first();
            if (guild) {
                const stats = await userManager.getInactivityStats(guild);
                log(`[Inactivity] נמצאו ${stats.kickCandidates.length} מועמדים להרחקה.`);
            }
        }, { timezone: "Asia/Jerusalem" });

        // --- 🔥 התראת FOMO (כל 5 דקות) ---
        let lastAlertTime = 0; // נשמר בזיכרון לגיבוי
        const ALERT_COOLDOWN = 4 * 60 * 60 * 1000; // 4 שעות

        cron.schedule('*/5 * * * *', async () => {
            if (!client) return;
            try {
                const guild = client.guilds.cache.first();
                if (!guild) return;

                // בדיקת Cooldown מה-DB למניעת ספאם בריסטרט
                const timerDoc = await TIMERS_REF.get();
                const lastFomo = timerDoc.exists ? timerDoc.data().lastFomoAlert : 0;

                if (Date.now() - new Date(lastFomo).getTime() < ALERT_COOLDOWN) return;

                let totalVoiceUsers = 0;
                let activeMembers = [];
                
                guild.channels.cache.forEach(c => {
                    if (c.type === 2) { // Voice Channel
                        const humans = c.members.filter(m => !m.user.bot);
                        totalVoiceUsers += humans.size;
                        humans.forEach(m => activeMembers.push(m.displayName));
                    }
                });

                if (totalVoiceUsers >= 4) {
                    const names = activeMembers.join(', '); // ✅ מציג את כולם
                    const message = `🔥 **אש בחדרים!**\n${names} כבר בדיסקורד.\nרק אתם חסרים יא בוטים.`;
                    
                    log(`[Scheduler] 🚀 שליחת התראת FOMO (פעילים: ${totalVoiceUsers})`);
                    await sendToMainGroup(message);

                    // עדכון זמן שליחה ב-DB
                    await TIMERS_REF.set({ lastFomoAlert: new Date().toISOString() }, { merge: true });
                }
            } catch (error) {
                console.error('[Scheduler Error] FOMO Loop:', error);
            }
        });

        // --- 🖼️ הזמנה חודשית לטלגרם (1 לחודש ב-12:00) ---
        cron.schedule('0 12 1 * *', async () => {
             // (כאן יושבת הלוגיקה של הטלגרם אם קיימת אצלך)
        }, { timezone: "Asia/Jerusalem" });

        log('[Scheduler] ✅ כל המשימות תוזמנו בהצלחה.');
    }
};

// פונקציית עזר: סנכרון נוכחות ראשוני
async function runInitialPresenceScan(client) {
    log('[PreseneSync] 🔄 מבצע סנכרון רולים ראשוני...');
    const guild = client.guilds.cache.first();
    if (!guild) return;

    try {
        const members = await guild.members.fetch();
        members.forEach(member => {
            if (member.user.bot) return;
            if (member.presence) {
                presenceHandler.processMember(member, member.presence);
            }
        });
        log(`[PreseneSync] ✅ הסנכרון הסתיים עבור ${members.size} משתמשים.`);
    } catch (e) {
        console.error('[PreseneSync Error]', e);
    }
}