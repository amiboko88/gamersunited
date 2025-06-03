// 📁 ttsCommand.js – פקודת Slash להצגת סטטוס TTS (גרסה עברית, גדולה, מימין לשמאל, OpenAI בלבד)

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTTSQuotaReport } = require('../tts/ttsQuotaManager');

function rtl(txt) {
  return `\u200F${txt}`; // סימון RTL
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tts')
    .setDescription('מציג את מצב השימוש בקול של שמעון (OpenAI בלבד)'),

  async execute(interaction) {
    try {
      const report = await getTTSQuotaReport();
      if (!report) throw new Error('הדו"ח לא זמין');

      // גרסה עם Embed – הכל עברית, אימוג'י בסוף, מימין לשמאל, טקסט גדול
      const embed = new EmbedBuilder()
        .setTitle(rtl('🔊 סטטוס TTS של שמעון'))
        .setColor(0x2b2d31)
        .addFields(
          {
            name: rtl('תווים יומיים'),
            value: rtl(`__${report.dailyCharacters.used}__ מתוך __${report.dailyCharacters.limit}__  📅\n${report.dailyCharacters.status}`),
            inline: false
          },
          {
            name: rtl('קריאות יומיות'),
            value: rtl(`__${report.dailyCalls.used}__ מתוך __${report.dailyCalls.limit}__  📞\n${report.dailyCalls.status}`),
            inline: false
          },
          {
            name: rtl('תווים חודשיים'),
            value: rtl(`__${report.monthlyCharacters.used}__ מתוך __${report.monthlyCharacters.limit}__  🗓️\n${report.monthlyCharacters.status}`),
            inline: false
          }
        )
        .setFooter({ text: rtl('אם הגענו ל־90% – שמעון יעבור למצב דממה 😶‍🌫️') });

      // אפשר גם לשלוח טקסט פשוט:
      /*
      const text = [
        rtl('__🔊 סטטוס TTS של שמעון__'),
        rtl(`• תווים יומיים: ${report.dailyCharacters.used} מתוך ${report.dailyCharacters.limit} 📅  –  ${report.dailyCharacters.status}`),
        rtl(`• קריאות יומיות: ${report.dailyCalls.used} מתוך ${report.dailyCalls.limit} 📞  –  ${report.dailyCalls.status}`),
        rtl(`• תווים חודשיים: ${report.monthlyCharacters.used} מתוך ${report.monthlyCharacters.limit} 🗓️  –  ${report.monthlyCharacters.status}`),
        rtl('אם הגענו ל־90% – שמעון יעבור למצב דממה 😶‍🌫️')
      ].join('\n');
      */

      await interaction.reply({
        embeds: [embed],
        // content: text, // להחליף ל־content אם רוצים טקסט רגיל (לא Embed)
        flags: 64 // ✅ לא ציבורי
      });

    } catch (err) {
      console.error('❌ שגיאה בפקודת /tts:', err);
      await interaction.reply({
        content: rtl('שמעון לא הצליח להביא את הסטטוס כרגע 😢'),
        flags: 64
      });
    }
  }
};
