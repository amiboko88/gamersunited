const { AttachmentBuilder } = require('discord.js');
const db = require('../utils/firebase');
const { renderLeaderboardImage } = require('./leaderboardRenderer');
const path = require('path');

// עדכן את מזהה הערוץ שלך כאן
const CHANNEL_ID = '1375415570937151519';

function calculateScore(data) {
  return (
    (data.voiceMinutes || 0) * 1 +
    (data.messagesSent || 0) * 2 +
    (data.slashUsed || 0) * 3 +
    (data.soundsUsed || 0) * 2 +
    (data.smartReplies || 0) * 1 +
    (data.rsvpCount || 0) * 2 +
    (data.mvpWins || 0) * 5 +
    (data.joinStreak || 0) * 3
  );
}

async function fetchTopUsers(limit = 10) {
  const snapshot = await db.collection('userStats').get();
  const users = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const score = calculateScore(data);
    if (score > 0) {
      users.push({ userId: doc.id, score, ...data });
    }
  });

  return users.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function sendLeaderboardEmbed(client) {
  try {
    const topUsers = await fetchTopUsers(5);

    if (!topUsers.length) {
      console.log('ℹ️ אין משתמשים פעילים ל־Leaderboard.');
      return false;
    }

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch();

    const enrichedUsers = topUsers.map(user => {
      const member = members.get(user.userId);
      return {
        name: member?.displayName || 'Unknown',
        avatarURL: member?.displayAvatarURL({ extension: 'png', size: 128 }) || '',
        score: user.score,
        mvpWins: user.mvpWins || 0,
        joinStreak: user.joinStreak || 0
      };
    });

    const imagePath = await renderLeaderboardImage(enrichedUsers);
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);

    if (!channel) {
      console.error('❌ לא נמצא ערוץ עם ID:', CHANNEL_ID);
      return false;
    }

    // 🖼️ שליחת הלוגו הקבוע (ברוחב מלא)
     await channel.send({
     content: '**🏆 לוח פעילות לשבוע זה**',
     files: [new AttachmentBuilder(path.join(__dirname, '../assets/leaderboard_intro.png'))],
    allowedMentions: { parse: [] }
    });

    // 🖼️ שליחת לוח הפעילות
     const leaderboardImage = new AttachmentBuilder(imagePath);
     await channel.send({
     files: [leaderboardImage],
     allowedMentions: { parse: [] }
    });

    await message.react('🏅');
    console.log('✅ לוח הפעילות נשלח בהצלחה.');
    return true;

  } catch (error) {
    console.error('❌ שגיאה בשליחת Leaderboard:', error);
    return false;
  }
}

module.exports = { sendLeaderboardEmbed };
