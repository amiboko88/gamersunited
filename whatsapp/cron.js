const cron = require('node-cron');
const { checkDailyBirthdays, nagMissingBirthdays } = require('./handlers/waBirthdayHandler');

function startWhatsAppCron() {
    console.log('[Cron] ⏳ Starting WhatsApp schedulers...');

    // 1. בדיקת ימי הולדת - כל יום ב-09:00 בבוקר
    cron.schedule('0 9 * * *', () => {
        checkDailyBirthdays();
    }, { timezone: "Asia/Jerusalem" });

    // 2. הצקה למשתמשים ללא תאריך - ב-1 לחודש ב-18:00
    cron.schedule('0 18 1 * *', () => {
        nagMissingBirthdays();
    }, { timezone: "Asia/Jerusalem" });
}

module.exports = { startWhatsAppCron };