const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../utils/firebase');
const fs = require('fs');
const path = require('path');
const { generateLeaderboardImage } = require('./leaderboardImage');

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
  const totalPoints = topUsers.reduce((sum, u) => sum + u.score, 0);

  const medals = ['🥇', '🥈', '🥉'];
  const lines = topUsers.map((user, i) => {
    const member = members.get(user.userId);
    const name = member?.displayName || 'Unknown';
    const prefix = medals[i] || `**${i + 1}.**`;
    const pointsText = `${user.score} pts`;
    return `${prefix} ${pointsText} — ${name}`;
  });

  const canvasBuffer = await generateLeaderboardImage(topUsers, members);
  const canvasAttachment = new AttachmentBuilder(canvasBuffer, { name: 'leaderboard.png' });

  const embed = new EmbedBuilder()
    .setColor(0xffcc00)
    .setImage('attachment://leaderboard.png')
    .setThumbnail('attachment://logo.png')
    .setTimestamp()
    .setDescription(
      `🏆 **מצטייני השבוע בקהילה** 🏆\n\n` +
      `💥 השבוע צברו המשתמשים הפעילים יחד סך של ${totalPoints} נקודות! 💥\n\n` +
      `🎮 המשתמשים הפעילים ביותר בקהילת GAMERS UNITED IL:\n\n` +
      lines.join('\n\n')
    );

  const logoPath = path.join(__dirname, '../assets/logo.png');
  const logoAttachment = new AttachmentBuilder(logoPath);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error('❌ לא נמצא ערוץ עם ID:', CHANNEL_ID);
    return false;
  }

  const message = await channel.send({
    embeds: [embed],
    files: [canvasAttachment, logoAttachment]
  });

  await message.react('🏅');
  return true;
}

module.exports = { sendLeaderboardEmbed };
