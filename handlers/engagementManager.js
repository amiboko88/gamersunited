// 📁 handlers/engagementManager.js - מערכת XP ורמות מתקדמת בעברית
const db = require('../utils/firebase');
const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const Canvas = require('canvas');
const path = require('path');

const LEVEL_FORMULA = level => 5 * (level ** 2) + 50 * level + 100;
const COOLDOWN_SECONDS = 60; // מניעת ספאם
const lastMessageTimestamps = new Map();

async function handleXPMessage(message) {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const now = Date.now();
  const cooldownKey = `${message.guild.id}-${userId}`;

  if (lastMessageTimestamps.has(cooldownKey)) {
    const last = lastMessageTimestamps.get(cooldownKey);
    if ((now - last) / 1000 < COOLDOWN_SECONDS) return;
  }

  lastMessageTimestamps.set(cooldownKey, now);

  const charCount = message.content.length;
  const xpGain = Math.floor(charCount / 10); // 1 XP לכל 10 תווים
  if (xpGain === 0) return;

  const ref = db.collection('userLevels').doc(userId);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : { xp: 0, level: 1 };

  let { xp, level } = data;
  xp += xpGain;
  const requiredXP = LEVEL_FORMULA(level);

  if (xp >= requiredXP) {
    level++;
    xp -= requiredXP;

    message.channel.send(`🎉 <@${userId}> עלה לרמה **${level}**!`);
  }

  await ref.set({ xp, level }, { merge: true });
}

const rankCommand = {
  data: new SlashCommandBuilder()
    .setName('רמה_שלי')
    .setDescription('📊 הצג את הרמה ו־XP הנוכחיים שלך'),

  execute: async interaction => {
    // שליחת defer מיידי כדי למנוע פקיעת תוקף
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const userId = interaction.user.id;
    const ref = db.collection('userLevels').doc(userId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : { xp: 0, level: 1 };

    const { xp, level } = data;
    const required = LEVEL_FORMULA(level);
    const percent = Math.min(xp / required, 1);

    const canvas = Canvas.createCanvas(600, 200);
    const ctx = canvas.getContext('2d');

    // רקע כללי
    ctx.fillStyle = '#1e1e2f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // טקסט משתמש וסטטיסטיקות
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.fillText(`${interaction.user.username}`, 150, 50);
    ctx.font = '20px sans-serif';
    ctx.fillText(`רמה: ${level}`, 150, 85);
    ctx.fillText(`XP: ${xp} / ${required}`, 150, 115);

    // בר התקדמות
    ctx.fillStyle = '#444';
    ctx.fillRect(150, 130, 300, 25);
    ctx.fillStyle = '#00ff88';
    ctx.fillRect(150, 130, 300 * percent, 25);

    // תמונת פרופיל מעוגלת
    const avatar = await Canvas.loadImage(interaction.user.displayAvatarURL({ extension: 'jpg' }));
    ctx.save();
    ctx.beginPath();
    ctx.arc(75, 75, 50, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 25, 25, 100, 100);
    ctx.restore();

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'rank.png' });

    // שליחה סופית של ההודעה עם התמונה
    await interaction.editReply({ files: [attachment] });
  }
};


module.exports = {
  handleXPMessage,
  rankCommand
};
