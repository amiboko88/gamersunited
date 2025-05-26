const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../utils/firebase');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1375415570937151519';
const IMAGES_DIR = path.join(__dirname, '../images/leaderboard');
const TOTAL_IMAGES = 10; // שים כאן את כמות הקבצים הקיימים בתיקיה (leaderboard1.png ...)

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

function getImageForCurrentWeek() {
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
  const index = ((week - 1) % TOTAL_IMAGES) + 1;
  return path.join(IMAGES_DIR, `leaderboard${index}.png`);
}

async function sendLeaderboardEmbed(client) {
  const topUsers = await fetchTopUsers();
  if (!topUsers.length) return;

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();

  const lines = topUsers.map((user, i) => {
    const member = members.get(user.userId);
    const name = member?.displayName || 'Unknown';
    return `**${i + 1}.** ${name} — ${user.score} נק׳`;
  });

  const imagePath = getImageForCurrentWeek();
  const embed = new EmbedBuilder()
    .setTitle('🏆 מצטייני השבוע בקהילה 🏆')
    .setDescription(lines.join('\n'))
    .setColor(0xffcc00)
    .setImage(`attachment://${path.basename(imagePath)}`)
    .setThumbnail('attachment://logo.png')
    .setTimestamp();

  const fileImage = new AttachmentBuilder(imagePath);
  const fileLogo = new AttachmentBuilder(path.join(__dirname, '../assets/logo.png'));

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (channel) {
    await channel.send({ embeds: [embed], files: [fileImage, fileLogo] });
  }
}

module.exports = { sendLeaderboardEmbed };
