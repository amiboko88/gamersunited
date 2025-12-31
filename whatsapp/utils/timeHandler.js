const { log } = require('../../utils/logger');

function isSystemActive() {
    const now = new Date();
    
    // המרה לשעון ישראל
    const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const day = israelTime.getDay(); // 0 = ראשון, 6 = שבת
    const hour = israelTime.getHours();

    // 1. 🕯️ שמירת שבת 🕯️
    // שישי (5) החל מ-17:00 ועד שבת (6) ב-20:00
    if (day === 5 && hour >= 17) return { active: false, reason: "Shabbat" };
    if (day === 6 && hour < 20) return { active: false, reason: "Shabbat" };

    // 2. 😴 שעות שינה (01:00 - 08:00)
    if (hour >= 1 && hour < 8) return { active: false, reason: "Night" };

    // 3. 🛌 שנ"צ (14:00 - 16:00)
    if (hour >= 14 && hour < 16) return { active: false, reason: "Siesta" };

    return { active: true };
}

module.exports = { isSystemActive };