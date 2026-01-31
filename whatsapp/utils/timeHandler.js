const { log } = require('../../utils/logger');
const shabbatManager = require('../../handlers/community/shabbat');

function isSystemActive() {
    const now = new Date(); // Local server time (assuming offset handled or irrelevant for isShabbat)

    // 1. 🕯️ שמירת שבת 🕯️ (Dynamic Check)
    if (shabbatManager.isShabbat()) {
        return { active: false, reason: "Shabbat" };
    }

    // המרה לשעון ישראל עבור לוגיקה קבועה (במידה והשרת לא בישראל)
    const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const hour = israelTime.getHours();

    // 2. 😴 שעות שינה (01:00 - 08:00)
    if (hour >= 1 && hour < 8) return { active: false, reason: "Night" };

    // 3. 🛌 שנ"צ (14:00 - 16:00)
    if (hour >= 14 && hour < 16) return { active: false, reason: "Siesta" };

    return { active: true };
}

module.exports = { isSystemActive };