// 📁 commands/fixInactivity.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/firebase');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fix_inactivity')
    .setDescription('תיקון שדות חסרים וסימון פעילות כללי (חד־פעמי)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const snapshot = await db.collection('memberTracking').get();
    let updated = 0;
    const now = Date.now();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updates = {};

      // 🧠 תיקון תאריך פעילות
      let baseDate = data.lastActivity;
      if (!baseDate || new Date(baseDate).getTime() > now) {
        baseDate = data.joinedAt || new Date(now - 45 * 86400000).toISOString();
        updates.lastActivity = baseDate;
      }

      const last = new Date(baseDate || data.lastActivity || data.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      // 🔍 קביעה לפי פעילות אחרונה ומשקל
      const weight = data.activityWeight || 0;
      if (weight === 2) {
        updates.isInactive = false;
        updates.inactivityLevel = 0;
      } else if (weight === 1 && daysInactive > 60) {
        updates.isInactive = true;
        updates.inactivityLevel = 1;
      } else if (weight < 1 && daysInactive > 30) {
        updates.isInactive = true;
        updates.inactivityLevel = 1;
      } else {
        updates.isInactive = false;
        updates.inactivityLevel = 0;
      }

      // 🧩 שדות נוספים
      if (typeof data.dmSent !== 'boolean') updates.dmSent = false;
      if (typeof data.dmFailed !== 'boolean') updates.dmFailed = false;
      if (typeof data.replied !== 'boolean') updates.replied = false;
      if (typeof data.reminderCount !== 'number') updates.reminderCount = 0;
      if (typeof data.activityWeight !== 'number') updates.activityWeight = 0;

      if (Object.keys(updates).length > 0) {
        await doc.ref.set(updates, { merge: true });
        updated++;
      }
    }

    await interaction.editReply(`✅ עודכנו ${updated} משתמשים עם פעילות, משקל וסטטוס מדויק. אין צורך להפעיל שוב.`);
  }
};
