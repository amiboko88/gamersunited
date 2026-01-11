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
        console.error('Error fetching MVP for status:', error.message);
        return null;
    }
}

/**
 * מבצע את החלפת הסטטוס
 */
async function rotateStatus(client) {
    if (!client.user) return;

    // 1. איסוף נתונים חיים
    let totalVoice = 0;
    client.guilds.cache.forEach(g => {
        g.channels.cache.forEach(c => {
            if (c.type === 2) totalVoice += c.members.filter(m => !m.user.bot).size;
        });
    });

    const mvp = await getRealMVP();

    // 2. מאגר הסטטוסים המשודרג
    const activities = [
        // --- סטטוסים תחרותיים ---
        { name: `Call of Duty: Black Ops 6`, type: ActivityType.Playing },
        { name: `!פיפו | מחלק פקודות`, type: ActivityType.Custom }, // או Competing
        
        // --- סטטוסים ניהוליים ---
        { name: `על ${client.users.cache.size} משתמשים`, type: ActivityType.Watching },
        { name: `תלונות בוואטסאפ`, type: ActivityType.Listening },
        
        // --- סטטוסים ציניים (האופי של שמעון) ---
        { name: `מי יקבל באן היום?`, type: ActivityType.Thinking },
        { name: `מחשב כמה עליתם לי`, type: ActivityType.Watching },
        { name: `איפה יוגי?`, type: ActivityType.Watching },
    ];

    // הוספה דינמית: אם יש אנשים בחדרים
    if (totalVoice > 0) {
        activities.push({ 
            name: `${totalVoice} אנשים צועקים בחדרים`, 
            type: ActivityType.Listening 
        });
    }

    // הוספה דינמית: אם יש MVP
    if (mvp) {
        activities.push({ 
            name: `👑 המלך: ${mvp.name} (${mvp.xp} XP)`, 
            type: ActivityType.Competing 
        });
    }

    // בחירה וביצוע
    const status = activities[currentIndex % activities.length];
    
    client.user.setPresence({
        activities: [{ name: status.name, type: status.type }],
        status: 'online'
    });

    currentIndex++;
}

module.exports = {
    start: (client) => {
        rotateStatus(client); 
        // החלפה כל 20 שניות (קצת יותר מהר כדי שיהיה מעניין)
        setInterval(() => rotateStatus(client), 20000); 
        log('[StatusSystem] ✅ מערכת הסטטוסים המשודרגת הופעלה.');
    }
};