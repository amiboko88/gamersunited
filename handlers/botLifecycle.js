// 📁 handlers/botLifecycle.js
const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

// --- ייבוא כל הפונקציות מהמודולים השונים ---
const { sendWeeklyReminder } = require('./weeklyBirthdayReminder');
const { sendBirthdayMessage } = require('./birthdayCongratulator');
const { checkBirthdays } = require('./birthdayTracker');
const { cleanupEmptyChannels } = require('./channelCleaner');
const { checkActiveGroups } = require('./groupTracker');
const { checkAndRemindInactive } = require('./inactivityReminder'); // <-- הוספנו את הייבוא הנכון
const { checkMvpReactions } = require('./mvpReactions');
const { checkMVPStatusAndRun } = require('./mvpTracker');
const { rotatePresence } = require('./presenceRotator');
const { periodicPresenceCheck } = require('./presenceTracker');
const { updateDisplayChannel } = require('./statsUpdater');
const { checkPendingDms } = require('./verificationButton');
const { cleanupIdleConnections } = require('./voiceQueue');
const { sendBirthdayMessages: sendTelegramBirthdays } = require('../telegram/birthdayNotifierTelegram');
const { checkDailySilence } = require('../telegram/telegramTriggers');
const { cleanupOldFifoMessages } = require('../utils/fifoMemory');
const { startAutoTracking, kickFailedUsers } = require('./memberButtons');
const { updateWeeklyLeaderboard } = require('./leaderboardUpdater');
const { sendWarzoneEmbed } = require('./fifoWarzoneAnnouncer');

const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID || '881445829100060723';

// --- פונקציית עזר לשליחת לוגים ---
async function sendStaffLog(client, title, description, color) {
    try {
        const staffChannel = client.channels.cache.get(STAFF_CHANNEL_ID);
        if (staffChannel && staffChannel.isTextBased()) {
            const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
            await staffChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error(`[STAFF_LOG] ❌ שגיאה בשליחת לוג:`, error);
    }
}

function initializeCronJobs(client) {
    console.log('[CRON] מאתחל את כל משימות התזמון המרכזיות...');

    const tasks = [
        // --- משימות כלליות ומנהלתיות ---
        { name: 'החלפת נוכחות הבוט', schedule: '*/5 * * * *', func: rotatePresence },
        { name: 'ניקוי חיבורים קוליים ישנים', schedule: '* * * * *', func: cleanupIdleConnections },
        { name: 'ניקוי כפתורי FIFO ישנים', schedule: '*/10 * * * *', func: cleanupOldFifoMessages },
        { name: 'ניקוי ערוצי Team ריקים', schedule: '0 4 * * *', func: cleanupEmptyChannels },

        // --- מערכת חברים ופעילות ---
        { name: 'סריקת נוכחות תקופתית', schedule: '*/5 * * * *', func: periodicPresenceCheck },
        { name: 'עדכון ערוץ "In Voice"', schedule: '* * * * *', func: updateDisplayChannel },
        { name: 'בדיקת קבוצות פעילות', schedule: '* * * * *', func: checkActiveGroups },
        { name: 'עדכון סטטוס אי-פעילות אוטומטי', schedule: '*/30 * * * *', func: startAutoTracking },
        { name: 'תזכורת אוטומטית לאי-פעילים', schedule: '0 */6 * * *', func: checkAndRemindInactive }, // <-- השורה המתוקנת
        { name: 'בדיקת DM אימות ממתינים', schedule: '*/10 * * * *', func: checkPendingDms },
        { name: 'הרחקת משתמשים לא פעילים', schedule: '0 5 * * *', func: kickFailedUsers },

        // --- מערכת ימי הולדת ---
        { name: 'מעקב אחר ימי הולדת של היום', schedule: '*/30 * * * *', func: checkBirthdays },
        { name: 'שליחת ברכות יום הולדת בדיסקורד', schedule: '0 9 * * *', func: sendBirthdayMessage, timezone: 'Asia/Jerusalem' },
        { name: 'תזכורת יום הולדת שבועית', schedule: '0 20 * * 6', func: sendWeeklyReminder, timezone: 'Asia/Jerusalem' },
        
        // --- מערכת MVP ו-Leaderboard ---
        { name: 'בדיקה והכרזת MVP', schedule: '* * * * *', func: checkMVPStatusAndRun },
        { name: 'בדיקת ריאקשנים ל-MVP', schedule: '* * * * *', func: checkMvpReactions },
        { name: 'עדכון Leaderboard שבועי', schedule: '0 21 * * 6', func: updateWeeklyLeaderboard, timezone: 'Asia/Jerusalem' },
        
        // --- מערכת טלגרם ---
        { name: 'שליחת ברכות יום הולדת לטלגרם', schedule: '5 9 * * *', func: sendTelegramBirthdays, timezone: 'Asia/Jerusalem' },
        { name: 'בדיקת שקט בקבוצת טלגרם', schedule: '0 * * * *', func: checkDailySilence },
        
        // --- הכרזות Warzone (בשעות ספציפיות, לא בשישי) ---
        { name: 'הכרזת Warzone', schedule: '0 21-23,0,1 * * 0-4,6', func: sendWarzoneEmbed, timezone: 'Asia/Jerusalem' }
    ];

    tasks.forEach(task => {
        if (!cron.validate(task.schedule)) {
            console.error(`[CRON] ❌ לוח זמנים לא תקין עבור "${task.name}": ${task.schedule}`);
            return;
        }
        cron.schedule(task.schedule, async () => {
            console.log(`[CRON] ▶️  מריץ משימה: ${task.name}`);
            try {
                await task.func(client);
            } catch (error) {
                console.error(`[CRON] ❌ שגיאה במשימה "${task.name}":`, error);
                await sendStaffLog(client, `❌ Cron Job: כשל במשימה "${task.name}"`, `אירעה שגיאה: \`\`\`${error.message}\`\`\``, 0xFF0000);
            }
        }, { timezone: task.timezone });
        console.log(`[CRON] ✔️ משימה "${task.name}" מתוזמנת ל- "${task.schedule}"`);
    });
}

module.exports = { initializeCronJobs };