// 📁 commands/tts.js - פקודת Slash לדוח שימוש ב-TTS (למנהלים בלבד)
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getTTSQuotaReport } = require('../tts/ttsQuotaManager.eleven'); // ייבוא פונקציית הדוח

module.exports = {
  data: new SlashCommandBuilder()
    .setName('תווים')
    .setDescription('📊 הצג דוח שימוש ב־ElevenLabs TTS (למנהלים בלבד)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // רק מנהלים יכולים להשתמש

  async execute(interaction) {
    // שלח deferReply מיד כדי שהבוט יגיב בזמן
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const report = await getTTSQuotaReport();

      if (!report) {
        return interaction.editReply({
          content: '❌ שגיאה בשליפת דוח השימוש ב־TTS. ראה לוגים.',
          flags: MessageFlags.Ephemeral
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📊 דוח שימוש ב־ElevenLabs TTS')
        .setDescription('מצב שימוש במכסות הקול של שמעון.')
        .setColor('#800080') // צבע סגול
        .addFields(
          { name: 'תווים יומיים', value: `שימוש: \`${report.dailyCharacters.used}\` / \`${report.dailyCharacters.limit}\`\nסטטוס: ${report.dailyCharacters.status}`, inline: false },
          { name: 'קריאות יומיות', value: `שימוש: \`${report.dailyCalls.used}\` / \`${report.dailyCalls.limit}\`\nסטטוס: ${report.dailyCalls.status}`, inline: false },
          { name: 'תווים חודשיים', value: `שימוש: \`${report.monthlyCharacters.used}\` / \`${report.monthlyCharacters.limit}\`\nסטטוס: ${report.monthlyCharacters.status}`, inline: false }
        )
        .setFooter({ text: 'Shimon BOT - ניהול TTS' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } catch (error) {
      console.error('❌ שגיאה בפקודה /tts:', error);
      await interaction.editReply({
        content: '❌ אירעה שגיאה בביצוע הפקודה. בדוק לוגים.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};