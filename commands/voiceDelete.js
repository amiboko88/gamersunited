// 📁 voiceDelete.js
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
const ADMIN_ROLE_ID = '1133753472966201555';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deleterec')
    .setDescription('מוחק את כל ההקלטות של משתמש מסוים (למנהלים בלבד)')
    .addUserOption(option =>
      option.setName('משתמש')
        .setDescription('המשתמש שממנו יימחקו ההקלטות')
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = interaction.member;
    const targetUser = interaction.options.getUser('משתמש');

    const isAdmin = member.roles.cache.has(ADMIN_ROLE_ID);
    if (!isAdmin) {
      return interaction.reply({
        content: '🚫 הפקודה זמינה רק למנהלים (Admin).',
        ephemeral: true
      });
    }

    const userDir = path.join(RECORDINGS_DIR, targetUser.id);

    if (!fs.existsSync(userDir)) {
      return interaction.reply({
        content: `📭 לא נמצאו הקלטות עבור המשתמש ${targetUser.username}.`,
        ephemeral: true
      });
    }

    const files = fs.readdirSync(userDir).filter(f => f.endsWith('.pcm'));

    if (files.length === 0) {
      return interaction.reply({
        content: `📭 אין קבצים למחיקה עבור ${targetUser.username}.`,
        ephemeral: true
      });
    }

    try {
      for (const file of files) {
        fs.unlinkSync(path.join(userDir, file));
      }

      return interaction.reply({
        content: `🗑️ נמחקו ${files.length} הקלטות של ${targetUser.username}.`,
        ephemeral: true
      });
    } catch (err) {
      console.error('שגיאה במחיקת הקבצים:', err);
      return interaction.reply({
        content: '❌ שגיאה במחיקת ההקלטות.',
        ephemeral: true
      });
    }
  }
};
