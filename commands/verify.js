// 📁 commands/verify.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const { logToWebhook } = require('../utils/logger');

const VERIFIED_ROLE_ID = '1120787309432938607';
const TRACKING_COLLECTION = 'dmTracking';

const data = new SlashCommandBuilder()
  .setName('אימות')
  .setDescription('מאמת אותך ומעניק גישה לשרת (רק אם אין לך תפקידים)');

async function execute(interaction) {
  const member = interaction.member;
  if (!member || member.roles.cache.size > 1) {
    return interaction.reply({ content: '❌ אינך רשאי להשתמש בפקודה זו. רק משתמשים חדשים ללא תפקידים יכולים לאמת את עצמם.', flags: MessageFlags.Ephemeral });
  }

  try {
    await member.roles.add(VERIFIED_ROLE_ID);
    await db.collection(TRACKING_COLLECTION).doc(member.id).set({
      sentAt: new Date().toISOString(),
      type: 'verification',
      status: 'manual',
      guildId: interaction.guild.id
    });

    await interaction.reply({ content: '✅ אומתת בהצלחה! ברוך הבא 🎉', flags: MessageFlags.Ephemeral });
    logToWebhook({
      title: '🟢 אימות באמצעות Slash',
      description: `<@${member.id}> אומת באמצעות הפקודה /אמת`
    });
  } catch (err) {
    console.error('❌ שגיאה באימות Slash:', err);
    interaction.reply({ content: '⚠️ שגיאה באימות. פנה להנהלה.', flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  data,
  execute
};
