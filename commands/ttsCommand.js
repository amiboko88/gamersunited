// 📁 ttsCommand.js – פקודת Slash להצגת סטטוס TTS (גרסה מתוקנת)

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTTSQuotaReport } = require('../tts/ttsQuotaManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tts')
    .setDescription('מציג את מצב השימוש בקול של שמעון'),

  async execute(interaction) {
    try {
      const report = await getTTSQuotaReport();

      const embed = new EmbedBuilder()
        .setTitle('🔊 סטטוס TTS של שמעון')
        .setColor(0x2b2d31)
        .addFields(
          {
            name: '📅 תווים יומיים',
            value: `${report.dailyCharacters.used} מתוך ${report.dailyCharacters.limit} תווים\nסטטוס: ${report.dailyCharacters.status}`,
            inline: false
          },
          {
            name: '📞 קריאות יומיות',
            value: `${report.dailyCalls.used} מתוך ${report.dailyCalls.limit} קריאות\nסטטוס: ${report.dailyCalls.status}`,
            inline: false
          },
          {
            name: '🗓️ תווים חודשיים',
            value: `${report.monthlyCharacters.used} מתוך ${report.monthlyCharacters.limit} תווים\nסטטוס: ${report.monthlyCharacters.status}`,
            inline: false
          }
        )
        .setFooter({ text: 'אם הגענו ל־90% – שמעון יעבור אוטומטית ל־Gemini Flash 😶‍🌫️' });

      await interaction.reply({
        embeds: [embed],
        flags: 64 // ✅ במקום ephemeral: true
      });
    } catch (err) {
      console.error('❌ שגיאה בפקודת /tts:', err);
      await interaction.reply({
        content: 'שמעון לא הצליח להביא את הסטטוס כרגע 😢',
        flags: 64
      });
    }
  }
};
