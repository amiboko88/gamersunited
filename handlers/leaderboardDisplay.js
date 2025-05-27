const { AttachmentBuilder } = require('discord.js');
const db = require('../utils/firebase');
const { renderLeaderboardImage } = require('./leaderboardRenderer');
const path = require('path');

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
  const topUsers = await fetchTopUsers();
  if (!topUsers.length) {
    console.log('ℹ️ אין משתמשים פעילים ל־Leaderboard.');
    return false;
  }

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();

  // יצירת רשימת משתמשים עם אוואטרים
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

  // יצירת התמונה דרך Puppeteer
  const imagePath = await renderLeaderboardImage(enrichedUsers);

  const image = new AttachmentBuilder(imagePath);
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);

  if (!channel) {
    console.error('❌ לא נמצא ערוץ עם ID:', CHANNEL_ID);
    return false;
  }

  const message = await channel.send({
    content: '🏆 לוח פעילות שבועי 📸',
    files: [image]
  });

  await message.react('🏅');
  return true;
}

module.exports = { sendLeaderboardEmbed };
