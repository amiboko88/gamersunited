const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../utils/firebase');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1375415570937151519';
const IMAGES_DIR = path.join(__dirname, '../images/leaderboard');

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
  const snapshot = await db.collection('userStats').get();

  const users = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    users.push({ userId: doc.id, score: calculateScore(data), ...data });
  });

  return users.sort((a, b) => b.score - a.score).slice(0, limit);
}

function getImageForCurrentWeek() {
  const now = new Date();
  const week = Math.ceil((((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + 1) / 7);

  const availableImages = fs.readdirSync(IMAGES_DIR)
    .filter(file => /^leaderboard\d+\.png$/.test(file))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0], 10);
      const numB = parseInt(b.match(/\d+/)[0], 10);
      return numA - numB;
    });

  if (!availableImages.length) {
    console.warn('⚠️ אין בכלל תמונות בתיקיית Leaderboard.');
    return null;
  }

  const index = (week - 1) % availableImages.length;
  const chosenFile = availableImages[index];
  console.log(`🖼️ תמונת Leaderboard שנבחרה לשבוע ${week}: ${chosenFile}`);
  return path.join(IMAGES_DIR, chosenFile);
}

async function sendLeaderboardEmbed(client) {
  const topUsers = await fetchTopUsers();
  if (!topUsers.length) {
    console.log('ℹ️ אין משתמשים פעילים ל־Leaderboard.');
    return false;
  }

  const imagePath = getImageForCurrentWeek();
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.warn('⚠️ תמונת Leaderboard לא נמצאה או לא קיימת:', imagePath);
    return false;
  }

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();

  const lines = topUsers.map((user, i) => {
    const member = members.get(user.userId);
    const name = member?.displayName || 'Unknown';
    return `**${i + 1}.** ${name} — ${user.score} נק׳`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🏆 מצטייני השבוע בקהילה 🏆')
    .setDescription(lines.join('\n'))
    .setColor(0xffcc00)
    .setImage(`attachment://${path.basename(imagePath)}`)
    .setThumbnail('attachment://logo.png')
    .setTimestamp();

  const fileImage = new AttachmentBuilder(imagePath);
  const fileLogo = new AttachmentBuilder(path.join(__dirname, '../assets/logo.png'));

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error('❌ לא נמצא ערוץ עם ID:', CHANNEL_ID);
    return false;
  }

  await channel.send({ embeds: [embed], files: [fileImage, fileLogo] });
  return true;
}

module.exports = { sendLeaderboardEmbed };
