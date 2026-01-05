// 📁 commands/inactivity.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { 
    buildMainPanelEmbed, 
    buildMainPanelComponents, 
    fetchAndProcessInactivityData 
} = require('../interactions/selectors/inactivitySelectMenuHandler');

const data = new SlashCommandBuilder()
  .setName('ניהול')
  .setDescription('מרכז הבקרה של שמעון')
  .addSubcommand(sub =>
    sub.setName('משתמשים').setDescription('📊 פתח לוח מחוונים גרפי לניהול משתמשים')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const execute = async (interaction, client) => {
  const sub = interaction.options.getSubcommand();

  if (sub === 'משתמשים') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({
        content: '⛔ גישה למנהלים בלבד.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // משתמשים ב-deferReply כדי לתת לבוט זמן לחשב ולייצר את הגרף
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // 1. חישוב נתונים
      const statsData = await fetchAndProcessInactivityData(interaction);

      // 2. בניית דאשבורד גרפי
      const embed = buildMainPanelEmbed(statsData);
      const components = buildMainPanelComponents();

      // 3. הצגה
      await interaction.editReply({
        embeds: [embed],
        components: components,
      });

    } catch (error) {
        console.error("❌ שגיאה בפקודת /ניהול משתמשים:", error);
        await interaction.editReply({ 
            content: '❌ אירעה שגיאה בטעינת הלוח הגרפי.' 
        });
    }
  }
};

module.exports = { data, execute };