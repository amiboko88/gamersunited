// 📁 commands/inactivity.js (הגרסה המפושטת והמעודכנת)
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
// ייבוא פונקציות בניית ה-Embed והקומפוננטות וגם שליפת הנתונים מהקובץ החדש
// (הן ממוקמות ב-interactions/selectors/inactivitySelectMenuHandler.js לפי ההסכמה האחרונה)
const { buildMainPanelEmbed, buildMainPanelComponents, getDetailedInactivityStats } = require('../interactions/selectors/inactivitySelectMenuHandler');

const data = new SlashCommandBuilder()
  .setName('ניהול')
  .setDescription('ניהול משתמשים לא פעילים')
  .addSubcommand(sub =>
    sub.setName('משתמשים').setDescription('📋 פתח לוח ניהול משתמשים')
  );

const execute = async (interaction, client) => {
  const sub = interaction.options.getSubcommand();
  if (sub === 'משתמשים') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({
        content: '⛔ הפקודה הזו זמינה רק לאדמינים עם הרשאת ADMINISTRATOR.',
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // שלוף נתונים אמיתיים באמצעות הפונקציה המועברת
    const stats = await getDetailedInactivityStats(client);
    // בנה Embed עם נתונים באמצעות הפונקציה המועברת
    const embed = buildMainPanelEmbed(client, stats);
    // בנה רכיבים (כפתורים ותפריט בחירה) באמצעות הפונקציה המועברת
    const components = buildMainPanelComponents();

    await interaction.editReply({
      embeds: [embed],
      components: components,
      flags: MessageFlags.Ephemeral,
    });
  }
};

module.exports = {
  data,
  execute,
};