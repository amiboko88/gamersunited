// 📁 commands/inactivity.js (מתוקן)
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
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
    await interaction.deferReply({ ephemeral: true });

    try {
      // --- ✅ [תיקון] העברת אובייקט ה-interaction השלם במקום client ---
      const stats = await getDetailedInactivityStats(interaction);
      const embed = buildMainPanelEmbed(interaction, stats);
      const components = buildMainPanelComponents();

      await interaction.editReply({
        embeds: [embed],
        components: components,
      });
    } catch (error) {
        console.error("❌ שגיאה בהפעלת פקודת /ניהול:", error);
        await interaction.editReply({ content: 'אירעה שגיאה בעת בניית הפאנל.' });
    }
  }
};

module.exports = {
  data,
  execute,
};