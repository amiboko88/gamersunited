// 📁 handlers/botLifecycle.js
const cron = require('node-cron');
const { log } = require('../utils/logger');

// --- ייבוא כל המודולים (Handlers) ---
const presenceRotator = require('./presenceRotator');
const inactivityCronJobs = require('./inactivityCronJobs');
const leaderboardUpdater = require('./leaderboardUpdater');
const weeklyBirthdayReminder = require('./weeklyBirthdayReminder');
const birthdayCongratulator = require('./birthdayCongratulator');
const mvpTracker = require('./mvpTracker');
const verificationButton = require('./verificationButton');
const voiceQueue = require('./voiceQueue');
const groupTracker = require('./groupTracker');
const channelCleaner = require('./channelCleaner');
const { updateVoiceCounterChannel } = require('./voiceHandler');

/**
 * פונקציית האתחול הראשית - נקראת מתוך index.js
 */
async function init(client) {
    log('[LIFECYCLE] 🔄 מאתחל מערכות תזמון ובוט...');

    try {
        // 1. הרצות מיידיות (Startup Tasks)
        await runStartupTasks(client);

        // 2. רישום משימות מתוזמנות (Cron Jobs)
        registerCronJobs(client);

        log('[LIFECYCLE] ✅ אתחול הושלם בהצלחה.');
    } catch (error) {
        console.error('[LIFECYCLE] ❌ שגיאה קריטית באתחול:', error);
    }
}

async function runStartupTasks(client) {
    try {
        // רוטציה ראשונית
        presenceRotator.rotatePresence(client);
        
        // בדיקות אתחול נוספות
        await birthdayCongratulator.runMissedBirthdayChecks(client);
        await verificationButton.setupVerificationMessage(client);
        await updateVoiceCounterChannel(client);
        await channelCleaner.cleanupEmptyVoiceChannels(client);
    } catch (error) {
        console.error('[STARTUP] שגיאה במשימות אתחול:', error);
    }
}

/**
 * הגדרת התזמונים הקבועים (CRON)
 * הוספנו לוגים לכל משימה כדי לוודא שהן רצות
 */
function registerCronJobs(client) {
    
    // 🔄 רוטציית סטטוס (כל 15 דקות)
    cron.schedule('*/15 * * * *', () => {
        // log('[CRON] 🔄 מבצע רוטציית סטטוס...'); // אפשר להחזיר אם רוצים לראות כל 15 דק'
        presenceRotator.rotatePresence(client);
    });

    // 🎂 בדיקת ימי הולדת יומית (08:00)
    cron.schedule('0 8 * * *', async () => {
        log('[CRON] 🎂 בודק ימי הולדת יומיים...');
        await birthdayCongratulator.sendBirthdayMessage(client);
    });

    // 📅 תזכורת יום הולדת שבועית (שישי ב-14:00)
    cron.schedule('0 14 * * 5', async () => {
        log('[CRON] 📅 שולח תזכורת יום הולדת שבועית...');
        await weeklyBirthdayReminder.sendWeeklyReminder(client);
    });

    // 🏆 עדכון Leaderboard שבועי (מוצ"ש ב-22:00)
    cron.schedule('0 22 * * 6', async () => {
        log('[CRON] 🏆 מריץ עדכון Leaderboard שבועי...');
        await leaderboardUpdater.updateWeeklyLeaderboard(client);
    });

    // 👑 הכרזת MVP שבועי (ראשון ב-20:00)
    cron.schedule('0 20 * * 0', async () => {
        log('[CRON] 👑 בודק MVP שבועי...');
        await mvpTracker.checkMVPStatusAndRun(client);
    });

    // 💤 בדיקת משתמשים לא פעילים (כל יום ב-19:00)
    cron.schedule('0 19 * * *', async () => {
        log('[CRON] 💤 מריץ בדיקת אי-פעילות יומית...');
        await inactivityCronJobs.runAutoTracking(client);
    });

    // 🧹 משימות תחזוקה שוטפות (כל 5 דקות) - הוספתי לוג עדין
    cron.schedule('*/5 * * * *', async () => {
        // log('[CRON] 🧹 מריץ ניקוי ערוצים וקבוצות...'); // לוג דיבאג
        await channelCleaner.cleanupEmptyVoiceChannels(client);
        await groupTracker.checkEmptyGroups(client);
    });

    // 🔊 בדיקת נגנים תקועים (כל 10 דקות)
    cron.schedule('*/10 * * * *', () => {
        voiceQueue.checkIdlePlayers(client);
    });

    // 📩 בדיקת הודעות אימות בפרטי (כל שעה)
    cron.schedule('0 * * * *', async () => {
        log('[CRON] 🔍 בודק אימותים תלויים (שעתי)...');
        await verificationButton.checkPendingDms(client);
    });

    // ❤️ Heartbeat Log - כדי לדעת שהבוט חי (כל 30 דקות)
    cron.schedule('*/30 * * * *', () => {
        const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        log(`[HEARTBEAT] 💓 הבוט חי ונושם. זיכרון בשימוש: ${memoryUsage.toFixed(2)} MB`);
    });

    log(`[CRON] ✅ כל המשימות תוזמנו בהצלחה.`);
}

module.exports = { init };