// 📁 discord/utils/statusRotator.js
const { ActivityType } = require('discord.js');
const db = require('../../utils/firebase');

let currentIndex = 0;

/**
 * מחליף את הסטטוס של הבוט כל דקה
 */
async function rotateStatus(client) {
    const statuses = [
        { name: 'Warzone | !פיפו', type: ActivityType.Competing },
        { name: 'Black Ops 6', type: ActivityType.Playing },
        { name: `על ${client.guilds.cache.size} שרתים`, type: ActivityType.Watching },
    ];

    // הוספת סטטוס דינמי: כמות אנשים בחדרים
    let totalVoice = 0;
    client.guilds.cache.forEach(g => {
        g.channels.cache.forEach(c => {
            if (c.type === 2) totalVoice += c.members.size;
        });
    });
    if (totalVoice > 0) {
        statuses.push({ name: `${totalVoice} שחקנים בחדרים 🎤`, type: ActivityType.Listening });
    }

    // הוספת סטטוס דינמי: ה-MVP הנוכחי
    try {
        const mvpDoc = await db.collection('system_metadata').doc('mvp_status').get();
        if (mvpDoc.exists && mvpDoc.data().currentMvpName) {
            statuses.push({ name: `👑 MVP: ${mvpDoc.data().currentMvpName}`, type: ActivityType.Watching });
        }
    } catch (e) {}

    // ביצוע ההחלפה
    const status = statuses[currentIndex % statuses.length];
    client.user.setActivity(status.name, { type: status.type });
    currentIndex++;
}

module.exports = (client) => {
    setInterval(() => rotateStatus(client), 30000); // כל 30 שניות
};