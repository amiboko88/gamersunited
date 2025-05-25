// 📁 handlers/leaderboardDisplay.js
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../utils/firebase');
const { generateLeaderboardImage } = require('../utils/dalleLeaderboardImage');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1375415570937151519'; // 🔁 החלף לערוץ הנכון

function calculateScore(data) {
  return (
    (data.voiceMinutes || 0) * 1 +
    (data.messagesSent || 0) * 2 +
    (data.slashUsed || 0) * 3 +
    (data.soundsUsed || 0) * 2 +
    (data.smartReplies || 0) * 1 +
    (data.rsvpCount || 0) * 2
  );
}

async function fetchTopUsers(limit = 10) {
  const snapshot = await db.collection('activityStats').get();
  const users = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    users.push({ userId: doc.id, score: calculateScore(data), ...data });
  });

  return users.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function sendLeaderboardEmbed(client) {
  const topUsers = await fetchTopUsers();
  if (!topUsers.length) return;

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();

  const lines = topUsers.map((user, i) => {
    const member = members.get(user.userId);
    const name = member?.displayName || 'Unknown';
    return `**${i + 1}.** ${name} — ${user.score} pts`;
  });

  const imagePath = path.join(__dirname, `../images/leaderboard/leaderboard-${new Date().toISOString().split('T')[0]}.png`);
  await generateLeaderboardImage(topUsers.map(u => members.get(u.userId)?.displayName || 'Unknown'), imagePath);

  const embed = new EmbedBuilder()
    .setTitle('🏆 מצטייני השבוע 🏆')
    .setDescription(lines.join('\n'))
    .setColor(0xffcc00)
    .setImage(`attachment://${path.basename(imagePath)}`)
    .setThumbnail('attachment://logo.png');

  const fileImage = new AttachmentBuilder(imagePath);
  const fileLogo = new AttachmentBuilder(path.join(__dirname, '../assets/logo.png'));

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (channel) {
    await channel.send({ embeds: [embed], files: [fileImage, fileLogo] });
  }
}

module.exports = { sendLeaderboardEmbed };
