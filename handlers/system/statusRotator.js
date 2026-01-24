// 📁 handlers/system/statusRotator.js
const { ActivityType } = require('discord.js');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

let currentIndex = 0;

/**
 * שולף את ה-MVP האמיתי (בעל ה-XP הגבוה ביותר)
 */
async function getRealMVP() {
    try {
        const snapshot = await db.collection('users')
            .orderBy('economy.xp', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        const data = snapshot.docs[0].data();
        return {
            name: data.identity?.displayName || 'Unknown',
            xp: data.economy?.xp || 0
        };
    } catch (error) {
        return null; // Silent fail
    }
}

/**
 * 💓 THE PULSE: מערכת סטטוסים חכמה שמגיבה למה שקורה בשרת
 */
async function rotateStatus(client) {
    if (!client.user) return;

    // 1. איסוף מודיעין מהשטח
    let totalVoice = 0;
    let gamesMap = new Map(); // ספירת משחקים

    client.guilds.cache.forEach(g => {
        g.channels.cache.forEach(c => {
            if (c.type === 2) { // Voice
                const members = c.members.filter(m => !m.user.bot);
                totalVoice += members.size;

                // בדיקה מה משחקים
                members.forEach(m => {
                    const activity = m.presence?.activities?.find(a => a.type === 0); // Playing
                    if (activity && activity.name) {
                        gamesMap.set(activity.name, (gamesMap.get(activity.name) || 0) + 1);
                    }
                });
            }
        });
    });

    // מציאת המשחק הפופולרי כרגע
    let topGame = null;
    let topGameCount = 0;
    for (const [game, count] of gamesMap.entries()) {
        if (count > topGameCount) {
            topGame = game;
            topGameCount = count;
        }
    }

    const mvp = await getRealMVP();

    // 2. בניית מאגר סטטוסים דינמי
    const activities = [];

    // --- A. מצב שקט (0-2 אנשים) ---
    if (totalVoice <= 2) {
        activities.push(
            { name: `את השקט... 🦗`, type: ActivityType.Listening },
            { name: `מי יקבל באן היום?`, type: ActivityType.Thinking },
            { name: `מנקה את השרת 🧹`, type: ActivityType.Custom },
            { name: `נטפליקס עם עצמי`, type: ActivityType.Watching }
        );
    }
    // --- B. מצב פעיל (3-9 אנשים) ---
    else if (totalVoice < 10) {
        activities.push(
            { name: `על ${totalVoice} אנשים בחדרים`, type: ActivityType.Watching },
            { name: `שיחות סלון`, type: ActivityType.Listening },
            { name: `תלונות בוואטסאפ`, type: ActivityType.Listening }
        );
        if (topGame && topGameCount > 1) {
            activities.push({ name: `${topGame} עם החבר'ה`, type: ActivityType.Playing });
        }
    }
    // --- C. מצב מלחמה (10+ אנשים) ---
    else {
        activities.push(
            { name: `🔥 השרת עולה באש!`, type: ActivityType.Playing },
            { name: `תביאו מטף דחוף!`, type: ActivityType.Competing },
            { name: `על הכאוס בחדרים`, type: ActivityType.Watching }
        );
    }

    // --- תוספות קבועות (MVP וכו') ---
    if (mvp) {
        activities.push({ name: `👑 המלך: ${mvp.name}`, type: ActivityType.Competing });
    }

    // סטטוסים קבועים של שמעון
    activities.push(
        { name: `!פיפו | מחלק פקודות`, type: ActivityType.Custom },
        { name: `מחשב כמה עליתם לי`, type: ActivityType.Watching }
    );

    // 3. בחירה רנדומלית (עדיף על סדר רץ במערכת דינמית)
    // אלא אם רוצים סדר? שמעון אוהב הפתעות.
    const status = activities[currentIndex % activities.length];

    // 4. עדכון
    client.user.setPresence({
        activities: [{ name: status.name, type: status.type }],
        status: totalVoice > 5 ? 'dnd' : 'online' // משנה צבע לאדום אם יש עומס!
    });

    currentIndex++;
}

module.exports = {
    start: (client) => {
        rotateStatus(client);
        // החלפה כל 20 שניות
        setInterval(() => rotateStatus(client), 20000);
        log('[StatusSystem] ✅ מערכת "The Pulse" הופעלה.');
    }
};