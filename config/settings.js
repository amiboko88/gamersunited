// 📁 config/settings.js

module.exports = {
    // הגדרות כלכלה ו-XP
    economy: {
        xpCooldown: 60, // שניות בין קבלת XP
        minXpPerMsg: 5,
        maxXpPerMsg: 50,
        charsPerXp: 10,   // כל 10 תווים = 1 XP נוסף
        levelBase: 100,  // בסיס לנוסחת עליית רמה
        levelMultiplier: 5, // מקדם ריבועי לנוסחה
        levelLinear: 50,     // מקדם ליניארי לנוסחה

        // הימורים
        minBet: 100,
        maxBet: 50000,
        bigBetThreshold: 50 // הימור שנחשב "כבד" ומקבל הודעה מיוחדת
    },

    // הגדרות מערכת הודעות (Buffer & Spam)
    buffer: {
        windowMs: 1500, // זמן המתנה לפני עיבוד הודעה (לאיחוד שורות)
        spamLimit: 7,   // מספר הודעות מקסימלי בחלון זמן
        spamWindowMs: 10000,
        cooldownMs: 60000 // זמן חסימה לספאמר
    },

    // הגדרות וואטסאפ
    whatsapp: {
        conversationTimeout: 120 * 1000, // זמן שיחה פתוחה עם ה-AI
        wakeWords: ['רולטה', 'הימור', 'בט', 'סקור', 'דמג', 'תנגן', 'שיר', 'מתי', 'יום הולדת', 'יומולדת', 'קרדיט', 'עזרה']
    },

    // הגדרות AI
    ai: {
        defaultContextWindow: 10, // כמה הודעות אחרונות לזכור
        maxTokens: 500,
    }
};
