// 📁 handlers/botLifecycle.js
const cron = require('node-cron');
const { sendStaffLog } = require('../utils/staffLogger');

// ייבוא כל המודולים הנדרשים
const { sendWeeklyReminder } = require('./weeklyBirthdayReminder');
const { sendBirthdayMessage } = require('./birthdayCongratulator');
const { checkBirthdays } = require('./birthdayTracker');
const { cleanupEmptyChannels } = require('./channelCleaner');
const { checkActiveGroups } = require('./groupTracker');
const { checkMVPStatusAndRun } = require('./mvpTracker');
const { rotatePresence } = require('./presenceRotator');
const { periodicPresenceCheck } = require('./presenceTracker');
const { checkPendingDms } = require('./verificationButton');
const { cleanupIdleConnections } = require('./voiceQueue');
const { sendBirthdayMessages: sendTelegramBirthdays } = require('../telegram/birthdayNotifierTelegram');
const { cleanupOldFifoMessages } = require('../utils/fifoMemory');
const { runAutoTracking, runScheduledReminders, runMonthlyKickReport } = require('./inactivityCronJobs');
const { updateWeeklyLeaderboard } = require('./leaderboardUpdater');
const { sendWarzoneEmbed } = require('./fifoWarzoneAnnouncer');

const podcastManager = require('./podcastManager');

let cronJobs = [];

function stopCronJobs() {
    cronJobs.forEach(job => job.stop());
    cronJobs = [];
    console.log('[CRON] כל משימות התזמון הופסקו.');
}

function initializeCronJobs(client) {
    stopCronJobs();
    console.log('[CRON] מאתחל את כל משימות התזמון המרכזיות...');

    const tasks = [
        // משימות שרצות כל דקה (רק מה שחייב להיות מיידי)
        { name: 'מעקב קבוצות פעילות', schedule: '* * * * *', func: checkActiveGroups, args: [client] },
        { name: 'ניקוי חיבורי קול ישנים', schedule: '* * * * *', func: cleanupIdleConnections, args: [] },

        // משימות שרצות כל 3 דקות
        { name: 'ניקוי ערוצים ריקים', schedule: '*/3 * * * *', func: cleanupEmptyChannels, args: [client] },
        
        // משימות שרצות כל 10 דקות
        { name: 'בדיקת נוכחות תקופתית', schedule: '*/10 * * * *', func: periodicPresenceCheck, args: [client] },
        { name: 'בדיקת הודעות אימות ממתינות', schedule: '*/10 * * * *', func: checkPendingDms, args: [client] },

        // משימות שרצות כל 15 דקות
        { name: 'החלפת סטטוס הבוט', schedule: '*/15 * * * *', func: rotatePresence, args: [client], runOnInit: true },

        // משימות שרצות כל 30 דקות
        { name: 'סריקת אי-פעילות אוטומטית', schedule: '*/30 * * * *', func: runAutoTracking, args: [client], runOnInit: true },
        
        // משימות שרצות פעם בשעה
        { name: 'ניקוי הודעות פיפו ישנות', schedule: '0 * * * *', func: cleanupOldFifoMessages, args: [client] },

        // משימות יומיות
        { name: 'בדיקת ימי הולדת', schedule: '1 0 * * *', func: checkBirthdays, args: [client], timezone: 'Asia/Jerusalem' },
        { name: 'שליחת ברכות יום הולדת בטלגרם', schedule: '2 0 * * *', func: sendTelegramBirthdays, args: [], timezone: 'Asia/Jerusalem' },
        { name: 'שליחת ברכות יום הולדת בדיסקורד', schedule: '3 0 * * *', func: sendBirthdayMessage, args: [client], timezone: 'Asia/Jerusalem' },
        { name: 'שליחת התראות אי-פעילות', schedule: '0 10,18 * * *', func: runScheduledReminders, args: [client], timezone: 'Asia/Jerusalem' },

        // משימות שבועיות
        { name: 'בדיקת MVP שבועי', schedule: '0 19 * * 0', func: checkMVPStatusAndRun, args: [client], timezone: 'Asia/Jerusalem' },
        { name: 'עדכון Leaderboard שבועי', schedule: '0 20 * * 0', func: updateWeeklyLeaderboard, args: [client], timezone: 'Asia/Jerusalem' },
        { name: 'תזכורת יום הולדת שבועית', schedule: '0 12 * * 1', func: sendWeeklyReminder, args: [client], timezone: 'Asia/Jerusalem' },
        
        // משימות חודשיות
        { name: 'דוח הרחקה חודשי', schedule: '0 12 1 * *', func: runMonthlyKickReport, args: [client], timezone: 'Asia/Jerusalem' },
        
        // משימות ייעודיות
        { name: 'הכרזת Warzone', schedule: '0 21 * * 3,4,6,0', func: sendWarzoneEmbed, args: [client], timezone: 'Asia/Jerusalem' },
    ];

    tasks.forEach(task => {
        if (!cron.validate(task.schedule)) {
            console.error(`[CRON] ❌ לוח זמנים לא תקין עבור "${task.name}": ${task.schedule}`);
            return;
        }

        const job = cron.schedule(task.schedule, async () => {
            console.log(`[CRON] ▶️  מריץ משימה: ${task.name}`);
            try {
                await task.func(...(task.args || []));
            } catch (error) {
                console.error(`[CRON] ❌ שגיאה במשימה "${task.name}":`, error);
                sendStaffLog(client, `❌ שגיאת Cron`, `אירעה שגיאה במשימה **${task.name}**:\n\`\`\`${error.message}\`\`\``, 0xff0000);
            }
        }, {
            timezone: task.timezone || "Asia/Jerusalem"
        });

        if (task.runOnInit) {
            console.log(`[CRON] ▶️  מריץ משימת אתחול מיידית: ${task.name}`);
            const initialRunPromise = task.func(...(task.args || []));
            if (initialRunPromise && typeof initialRunPromise.catch === 'function') {
                initialRunPromise.catch(e => console.error(`[CRON] ❌ שגיאה בהרצה ראשונית של "${task.name}":`, e));
            }
        }
        
        cronJobs.push(job);
    });

    console.log(`[CRON] ✅ ${cronJobs.length} משימות תזומנו בהצלחה.`);
    podcastManager.initializePodcastState();
}

module.exports = { initializeCronJobs, stopCronJobs };