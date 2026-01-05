// 📁 handlers/botLifecycle.js
const cron = require('node-cron');
const { log } = require('../utils/logger');

// --- ייבוא כל המודולים (Handlers) ---
const presenceRotator = require('./presenceRotator');
const inactivityCronJobs = require('./inactivityCronJobs');
const leaderboardUpdater = require('./leaderboardUpdater');
const weeklyBirthdayReminder = require('./weeklyBirthdayReminder'); // ✅ כעת בשימוש תקין
const birthdayCongratulator = require('./birthdayCongratulator');
const mvpTracker = require('./mvpTracker');
const verificationButton = require('./verificationButton');
const voiceQueue = require('./voiceQueue');
const groupTracker = require('./groupTracker');
const channelCleaner = require('./channelCleaner');
const { updateVoiceCounterChannel } = require('./voiceHandler');

// אם היה לך כאן ייבוא של sendWarzoneEmbed שלא בשימוש - הסרתי אותו כדי לנקות שגיאות.

/**
 * פונקציית האתחול הראשית - נקראת מתוך index.js
 */
async function init(client) {
    log('[LIFECYCLE] 🔄 מאתחל מערכות תזמון ובוט...');

    try {
        // 1. הרצות מיידיות (Startup Tasks)
        // דברים שחייבים לקרות ברגע שהבוט עולה
        await runStartupTasks(client);

        // 2. רישום משימות מתוזמנות (Cron Jobs)
        registerCronJobs(client);

        log('[LIFECYCLE] ✅ אתחול הושלם בהצלחה.');
    } catch (error) {
        console.error('[LIFECYCLE] ❌ שגיאה קריטית באתחול:', error);
    }
}

/**
 * משימות שרצות פעם אחת בעת עליית הבוט
 */
async function runStartupTasks(client) {
    // עדכון סטטוס (משחק/צופה)
    presenceRotator.rotatePresence(client);
    
    // בדיקת ימי הולדת (אולי פספסנו בזמן שהבוט היה למטה)
    await birthdayCongratulator.runMissedBirthdayChecks(client);
    
    // הצבת הודעת אימות בערוץ (אם חסרה)
    await verificationButton.setupVerificationMessage(client);
    
    // סנכרון מונה המחוברים הקוליים
    await updateVoiceCounterChannel(client);
    
    // ניקוי ערוצים שאולי נתקעו מהריצה הקודמת
    await channelCleaner.cleanupEmptyVoiceChannels(client);
}

/**
 * הגדרת התזמונים הקבועים (CRON)
 */
function registerCronJobs(client) {
    
    // 🔄 רוטציית סטטוס (כל 15 דקות)
    cron.schedule('*/15 * * * *', () => {
        presenceRotator.rotatePresence(client);
    });

    // 🎂 בדיקת ימי הולדת יומית (08:00)
    cron.schedule('0 8 * * *', async () => {
        await birthdayCongratulator.sendBirthdayMessage(client);
    });

    // 📅 תזכורת יום הולדת שבועית (שישי ב-14:00)
    // ✅ כאן אנחנו משתמשים במשתנה שהיה "אפור" אצלך
    cron.schedule('0 14 * * 5', async () => {
        await weeklyBirthdayReminder.sendWeeklyReminder(client);
    });

    // 🏆 עדכון Leaderboard שבועי (מוצ"ש ב-22:00)
    cron.schedule('0 22 * * 6', async () => {
        await leaderboardUpdater.updateWeeklyLeaderboard(client);
    });

    // 👑 הכרזת MVP שבועי (ראשון ב-20:00)
    cron.schedule('0 20 * * 0', async () => {
        await mvpTracker.checkMVPStatusAndRun(client);
    });

    // 💤 בדיקת משתמשים לא פעילים (כל יום ב-19:00)
    cron.schedule('0 19 * * *', async () => {
        await inactivityCronJobs.runAutoTracking(client);
    });

    // 🧹 ניקוי ערוצים וקבוצות (כל 5 דקות)
    cron.schedule('*/5 * * * *', async () => {
        await channelCleaner.cleanupEmptyVoiceChannels(client);
        await groupTracker.checkEmptyGroups(client);
    });

    // 🔊 בדיקת נגנים תקועים (כל 10 דקות)
    cron.schedule('*/10 * * * *', () => {
        voiceQueue.checkIdlePlayers(client);
    });

    // 📩 בדיקת הודעות אימות בפרטי (כל שעה)
    cron.schedule('0 * * * *', async () => {
        await verificationButton.checkPendingDms(client);
    });

    log(`[CRON] ✅ 9 משימות תוזמנו.`);
}

// ✅ הייצוא הקריטי - זה מה שמתקן את השגיאה ב-index.js
module.exports = { init };