// 📁 commands/fixInactivity.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/firebase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fix_inactivity')
    .setDescription('תיקון שדות חסרים במסד המשתמשים הלא פעילים')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const snapshot = await db.collection('memberTracking').get();
    let updated = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updates = {};

      if (!data.lastActivity) updates.lastActivity = new Date().toISOString();
      if (typeof data.dmSent !== 'boolean') updates.dmSent = false;
      if (typeof data.dmFailed !== 'boolean') updates.dmFailed = false;
      if (typeof data.replied !== 'boolean') updates.replied = false;

      if (Object.keys(updates).length > 0) {
        await doc.ref.set(updates, { merge: true });
        updated++;
      }
    }

    await interaction.editReply(`✅ עודכנו ${updated} משתמשים עם שדות חסרים.`);
  }
};
