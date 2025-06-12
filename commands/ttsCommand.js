// 📁 commands/ttsCommand.js – פקודת Slash להצגת סטטוס TTS של שמעון עם גרף חכם

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { generateTTSImage } = require('../utils/ttsStatsImage');
const { getTTSQuotaReport } = require('../tts/ttsQuotaManager');

function rtl(text) {
  return `\u200F${text}`; // מגדיר RTL
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tts')
    .setDescription('מציג את מצב השימוש בקול של שמעון (OpenAI בלבד)'),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const report = await getTTSQuotaReport();
      if (!report) throw new Error('הדו"ח לא זמין');

      const buffer = await generateTTSImage();
      const attachment = new AttachmentBuilder(buffer, { name: 'tts_stats.png' });

      const statusText = [
        `📊 מצב יומי: ${report.dailyCharacters.used} / ${report.dailyCharacters.limit} תווים – ${report.dailyCharacters.status}`,
        `📞 קריאות: ${report.dailyCalls.used} / ${report.dailyCalls.limit} – ${report.dailyCalls.status}`,
        `📆 מצב חודשי: ${report.monthlyCharacters.used} / ${report.monthlyCharacters.limit} – ${report.monthlyCharacters.status}`,
        `🧠 אם הגענו ל־90% – שמעון נכנס למצב דממה`
      ].map(rtl).join('\n');

      await interaction.editReply({
        content: statusText,
        files: [attachment]
      });

    } catch (err) {
      console.error('❌ שגיאה בפקודת /tts:', err);
      await interaction.editReply({
        content: rtl('שמעון לא הצליח להביא את הסטטוס כרגע 😢')
      });
    }
  }
};
