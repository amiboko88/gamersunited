// 📁 handlers/scheduler.js
const cron = require('node-cron');
const { log } = require('../utils/logger');
const db = require('../utils/firebase'); // ✅ חובה ל-Cooldown
const { sendToMainGroup } = require('../whatsapp/index');

// --- ייבוא המערכות ---
const rankingCore = require('./ranking/core');      
const userManager = require('./users/manager');     
const presenceHandler = require('../discord/events/presence'); 

const TIMERS_REF = db.collection('system_metadata').doc('timers');

module.exports = {
    initScheduler: (client) => {
        log('[Scheduler] ⏳ מאתחל את המשימות המתוזמנות (Cron Jobs)...');

        // 1. סנכרון ראשוני של רולים (Presence)
        runInitialPresenceScan(client);

        // 2. הגדרת CRON JOBS
        // ---------------------------------------------------

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
                log(`[Inactivity] נמצאו ${stats.kickCandidates.length} מועמדים להרחקה.`);
            }
        }, { timezone: "Asia/Jerusalem" });

        // --- 🔥 התראת FOMO (כל 5 דקות) ---
        cron.schedule('*/5 * * * *', async () => {
            if (!client) return;
            try {
                const guild = client.guilds.cache.first();
                if (!guild) return;

                // בדיקת Cooldown מה-DB למניעת ספאם בריסטרט
                const timerDoc = await TIMERS_REF.get();
                const lastFomo = timerDoc.exists ? timerDoc.data().lastFomoAlert : 0;
                const COOLDOWN = 4 * 60 * 60 * 1000; // 4 שעות

                if (Date.now() - new Date(lastFomo).getTime() < COOLDOWN) return;

                let activeMembers = [];
                guild.channels.cache.forEach(c => {
                    if (c.type === 2) { // Voice Channel
                        const humans = c.members.filter(m => !m.user.bot);
                        humans.forEach(m => activeMembers.push(m.displayName));
                    }
                });

                if (activeMembers.length >= 4) {
                    const names = activeMembers.join(', '); // ✅ מציג את כולם בלי slice
                    const message = `🔥 **אש בחדרים!**\n${names} כבר בדיסקורד.\nרק אתם חסרים יא בוטים.`;
                    
                    log(`[Scheduler] 🚀 שליחת התראת FOMO (פעילים: ${activeMembers.length})`);
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
             // לוגיקה עתידית לטלגרם
        }, { timezone: "Asia/Jerusalem" });

        log('[Scheduler] ✅ כל המשימות תוזמנו בהצלחה.');
    }
};

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