// 📁 discord/utils/statusRotator.js
const { ActivityType } = require('discord.js');
const db = require('../../utils/firebase');

let currentIndex = 0;

/**
 * מחליף את הסטטוס של הבוט
 */
async function rotateStatus(client) {
    if (!client.user) return; // הגנה למקרה שהבוט עדיין לא התחבר

    const statuses = [
        { name: 'Warzone | !פיפו', type: ActivityType.Competing },
        { name: 'Black Ops 6', type: ActivityType.Playing },
        { name: `על ${client.guilds.cache.size} שרתים`, type: ActivityType.Watching },
    ];

    // הוספת סטטוס דינמי: כמות אנשים בחדרים
    let totalVoice = 0;
    client.guilds.cache.forEach(g => {
        g.channels.cache.forEach(c => {
            if (c.type === 2) totalVoice += c.members.filter(m => !m.user.bot).size;
        });
    });
    
    if (totalVoice > 0) {
        statuses.push({ name: `${totalVoice} שחקנים בחדרים 🎤`, type: ActivityType.Listening });
    }

    // הוספת סטטוס דינמי: ה-MVP הנוכחי (מה-DB)
    try {
        const mvpDoc = await db.collection('system_metadata').doc('mvp_status').get();
        if (mvpDoc.exists && mvpDoc.data().currentMvpName) {
            statuses.push({ name: `👑 MVP: ${mvpDoc.data().currentMvpName}`, type: ActivityType.Watching });
        }
    } catch (e) {
        // מתעלמים משגיאות DB זמניות כדי לא לתקוע את הסטטוס
    }

    // ביצוע ההחלפה
    const status = statuses[currentIndex % statuses.length];
    
    // שימוש ב-setPresence לעדכון יציב יותר
    client.user.setPresence({
        activities: [{ name: status.name, type: status.type }],
        status: 'online'
    });

    currentIndex++;
}

module.exports = (client) => {
    // ✅ הפעלה ראשונית מיידית (כדי שלא נחכה 30 שניות עד שיראו סטטוס)
    rotateStatus(client);
    
    // הפעלה במחזוריות
    setInterval(() => rotateStatus(client), 30000); // כל 30 שניות
};