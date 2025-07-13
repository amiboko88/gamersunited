// 📁 handlers/botLifecycle.js (הגרסה המלאה והמעודכנת)
const cron = require('node-cron');
const { sendStaffLog } = require('../utils/staffLogger');

const { sendWeeklyReminder } = require('./weeklyBirthdayReminder');
const { sendBirthdayMessage } = require('./birthdayCongratulator');
const { checkBirthdays } = require('./birthdayTracker');
const { cleanupEmptyChannels } = require('./channelCleaner');
const { checkActiveGroups } = require('./groupTracker');
const { checkMvpReactions } = require('./mvpReactions');
const { checkMVPStatusAndRun } = require('./mvpTracker');
const { rotatePresence } = require('./presenceRotator');
const { periodicPresenceCheck } = require('./presenceTracker');
const { updateDisplayChannel } = require('./statsUpdater');
const { checkPendingDms } = require('./verificationButton');
const { cleanupIdleConnections } = require('./voiceQueue');
const { sendBirthdayMessages: sendTelegramBirthdays } = require('../telegram/birthdayNotifierTelegram');
const { cleanupOldFifoMessages } = require('../utils/fifoMemory');

const { runAutoTracking, runScheduledReminders, runMonthlyKickReport } = require('./inactivityCronJobs');
const { updateWeeklyLeaderboard } = require('./leaderboardUpdater');
const { sendWarzoneEmbed } = require('./fifoWarzoneAnnouncer');

// ✅ ייבוא מודול ה-podcastManager
const podcastManager = require('./podcastManager'); 

function initializeCronJobs(client) {
    console.log('[CRON] מאתחל את כל משימות התזמון המרכזיות...');

    const tasks = [
        // משימות כלליות
        { name: 'החלפת נוכחות הבוט', schedule: '*/5 * * * *', func: rotatePresence, quiet: true, args: [client] },
        { name: 'ניקוי חיבורים קוליים ישנים', schedule: '* * * * *', func: cleanupIdleConnections, quiet: true, args: [client] },
        { name: 'ניקוי כפתורי FIFO ישנים', schedule: '*/10 * * * *', func: cleanupOldFifoMessages, args: [client] },
        { name: 'ניקוי ערוצי Team ריקים', schedule: '0 4 * * *', func: cleanupEmptyChannels, args: [client] },
        { name: 'סריקת נוכחות תקופתית', schedule: '*/5 * * * *', func: periodicPresenceCheck, quiet: true, args: [client] },
        { name: 'עדכון ערוץ "In Voice"', schedule: '* * * * *', func: updateDisplayChannel, quiet: true, args: [client] },
        { name: 'בדיקת קבוצות פעילות', schedule: '* * * * *', func: checkActiveGroups, quiet: true, args: [client] },
        { name: 'בדיקת DM אימות ממתינים', schedule: '*/10 * * * *', func: checkPendingDms, args: [client] },

        // משימות ניהול משתמשים - עודכנו לקריאה מהקובץ החדש
        { name: 'עדכון סטטוס אי-פעילות אוטומטי', schedule: '*/30 * * * *', func: runAutoTracking, args: [client] },
        { name: 'שליחת תזכורות אי-פעילות אוטומטית', schedule: '0 8 * * *', func: runScheduledReminders, timezone: 'Asia/Jerusalem', args: [client] },
        { name: 'שליחת דוח הרחקה חודשי', schedule: '0 10 1 * *', func: runMonthlyKickReport, timezone: 'Asia/Jerusalem', args: [client] },

        // משימות ימי הולדת
        { name: 'מעקב אחר ימי הולדת של היום', schedule: '*/30 * * * *', func: checkBirthdays, args: [client] },
        { name: 'שליחת ברכות יום הולדת בדיסקורד', schedule: '0 9 * * *', func: sendBirthdayMessage, timezone: 'Asia/Jerusalem', args: [client] },
        { name: 'תזכורת יום הולדת שבועית', schedule: '0 20 * * 6', func: sendWeeklyReminder, timezone: 'Asia/Jerusalem', args: [client] },
        { name: 'שליחת ברכות יום הולדת לטלגרם', schedule: '5 9 * * *', func: sendTelegramBirthdays, timezone: 'Asia/Jerusalem', args: [client] },

        // משימות MVP וקהילה
        { name: 'בדיקה והכרזת MVP', schedule: '* * * * *', func: checkMVPStatusAndRun, quiet: true, args: [client, client.db] },
        { name: 'בדיקת ריאקשנים ל-MVP', schedule: '* * * * *', func: checkMvpReactions, quiet: true, args: [client, client.db] },
        { name: 'עדכון Leaderboard שבועי', schedule: '0 21 * * 6', func: updateWeeklyLeaderboard, timezone: 'Asia/Jerusalem', args: [client] },
        { name: 'הכרזת Warzone', schedule: '0 21-23,0,1 * * 0-4,6', func: sendWarzoneEmbed, timezone: 'Asia/Jerusalem', args: [client] },

        // ✅ משימות תזמון לפודקאסט
        { name: 'הפעלת ניטור פודקאסטים (שעות פעילות)', schedule: '0 18 * * *', func: () => podcastManager.setPodcastMonitoring(true), timezone: 'Asia/Jerusalem', args: [] },
        { name: 'כיבוי ניטור פודקאסטים (סיום שעות פעילות)', schedule: '0 6 * * *', func: () => podcastManager.setPodcastMonitoring(false), timezone: 'Asia/Jerusalem', args: [] },
    ];

    tasks.forEach(task => {
        if (!cron.validate(task.schedule)) {
            console.error(`[CRON] ❌ לוח זמנים לא תקין עבור "${task.name}": ${task.schedule}`);
            return;
        }
        cron.schedule(task.schedule, async () => {
            if (!task.quiet) { console.log(`[CRON] ▶️  מריץ משימה: ${task.name}`); }
            try {
                // שימוש בארגומנטים שהוגדרו או ב-client בלבד כברירת מחדל
                await task.func(...(task.args || [client]));
            } catch (error) {
                console.error(`[CRON] ❌ שגיאה במשימה "${task.name}":`, error);
                await sendStaffLog(client, `❌ Cron Job: כשל במשימה "${task.name}"`, `אירעה שגיאה: \`\`\`${error.message}\`\`\``, 0xFF0000);
            }
        }, { timezone: task.timezone });
        console.log(`[CRON] ✔️ משימה "${task.name}" מתוזמנת ל- "${task.schedule}"`);
    });
}

module.exports = { initializeCronJobs };