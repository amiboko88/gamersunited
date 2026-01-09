// 📁 handlers/system/statusRotator.js
const { ActivityType } = require('discord.js');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

let currentIndex = 0;

/**
 * פונקציה פנימית שמבצעת את החלפת הסטטוס בפועל
 */
async function rotateStatus(client) {
    if (!client.user) return; 

    const statuses = [
        { name: 'Warzone | !פיפו', type: ActivityType.Competing },
        { name: 'Black Ops 6', type: ActivityType.Playing },
        { name: `על ${client.guilds.cache.size} שרתים`, type: ActivityType.Watching },
    ];

    // 1. סטטוס דינמי: כמות אנשים בחדרים
    let totalVoice = 0;
    client.guilds.cache.forEach(g => {
        g.channels.cache.forEach(c => {
            if (c.type === 2) totalVoice += c.members.filter(m => !m.user.bot).size;
        });
    });
    
    if (totalVoice > 0) {
        statuses.push({ name: `${totalVoice} שחקנים בחדרים 🎤`, type: ActivityType.Listening });
    }

    // 2. סטטוס דינמי: MVP מה-DB
    try {
        const mvpDoc = await db.collection('system_metadata').doc('mvp_status').get();
        if (mvpDoc.exists && mvpDoc.data().currentMvpName) {
            statuses.push({ name: `👑 MVP: ${mvpDoc.data().currentMvpName}`, type: ActivityType.Watching });
        }
    } catch (e) {
        // מתעלמים משגיאות רגעיות ב-DB
    }

    // בחירת הסטטוס הבא
    const status = statuses[currentIndex % statuses.length];
    
    client.user.setPresence({
        activities: [{ name: status.name, type: status.type }],
        status: 'online'
    });

    currentIndex++;
}

module.exports = {
    /**
     * הפונקציה שנקראת מ-ready.js
     */
    start: (client) => {
        rotateStatus(client); // הרצה ראשונית מיידית
        setInterval(() => rotateStatus(client), 30000); // רוטציה כל 30 שניות
        log('[StatusSystem] ✅ מערכת הסטטוסים הופעלה.');
    }
};