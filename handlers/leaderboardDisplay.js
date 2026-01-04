// 📁 handlers/leaderboardDisplay.js
const { AttachmentBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const { renderLeaderboardImage } = require('./leaderboardRenderer');
const { sendLeaderboardToTelegram } = require('./sendLeaderboardToTelegram'); // אופציונלי
const path = require('path');

const CHANNEL_ID = '1375415570937151519';

/**
 * נוסחת הניקוד המעודכנת (AI 2026)
 * מבוססת על המבנה החדש של המשתמש
 */
function calculateScore(userData) {
    const stats = userData.stats || {};
    const economy = userData.economy || {};
    const tracking = userData.tracking || {}; // למשל rsvpCount יכול להיות שם

    return (
        (stats.voiceMinutes || 0) * 1 +
        (stats.messagesSent || 0) * 2 +
        (stats.commandsUsed || 0) * 3 +
        (stats.soundsUsed || 0) * 2 +
        (economy.mvpWins || 0) * 100 // בונוס ענק על MVP
    );
}

async function fetchTopUsers(limit = 5) {
    // שליפה של כל המשתמשים הפעילים
    // הערה: ב-Scale גבוה, עדיף להחזיק מונה נפרד, אבל כרגע זה יעבוד מצוין
    const snapshot = await db.collection('users').get();
    const users = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const score = calculateScore(data);

        if (score > 0) {
            users.push({
                userId: doc.id,
                score,
                voiceMinutes: data.stats?.voiceMinutes || 0,
                messagesSent: data.stats?.messagesSent || 0,
                mvpWins: data.economy?.mvpWins || 0,
                xp: data.economy?.xp || 0
            });
        }
    });

    return users.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function sendLeaderboardEmbed(client) {
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (!channel) return false;

    const topUsers = await fetchTopUsers(5);
    if (topUsers.length === 0) return false;

    // העשרת הנתונים עם שמות ותמונות מדיסקורד
    const enrichedUsers = await Promise.all(topUsers.map(async (u, index) => {
        const user = await client.users.fetch(u.userId).catch(() => null);
        return {
            name: user ? user.username : 'Unknown Warrior',
            avatarUrl: user ? user.displayAvatarURL({ extension: 'png' }) : '',
            score: u.score,
            rank: index + 1,
            details: `🎤 ${u.voiceMinutes} דק' | 💬 ${u.messagesSent} הודעות`
        };
    }));

    try {
        // יצירת התמונה (משתמשת בקובץ ה-Renderer הקיים והתקין)
        const imageBuffer = await renderLeaderboardImage(enrichedUsers);
        const leaderboardImage = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });

        const docRef = db.collection('system_metadata').doc('weeklyLeaderboard'); // מיקום נקי יותר
        const doc = await docRef.get();
        let message;

        // ניסיון לערוך הודעה קיימת
        if (doc.exists && doc.data().messageId) {
            const prevMessage = await channel.messages.fetch(doc.data().messageId).catch(() => null);
            if (prevMessage) {
                message = await prevMessage.edit({
                    content: '🏆 **מצטייני השבוע – GAMERS UNITED IL**',
                    files: [leaderboardImage]
                });
            }
        }

        // אם לא הצלחנו לערוך, שולחים חדש
        if (!message) {
            message = await channel.send({
                content: '🏆 **מצטייני השבוע – GAMERS UNITED IL**',
                files: [leaderboardImage]
            });
            await docRef.set({ messageId: message.id, lastUpdated: new Date().toISOString() });
        }

        // שליחה לטלגרם (אם קיים המודול)
        try {
            if (typeof sendLeaderboardToTelegram === 'function') {
                await sendLeaderboardToTelegram(enrichedUsers, imageBuffer);
            }
        } catch (e) { console.error('Telegram sync failed:', e); }

        return true;

    } catch (error) {
        console.error('Error sending leaderboard:', error);
        return false;
    }
}

module.exports = { sendLeaderboardEmbed };