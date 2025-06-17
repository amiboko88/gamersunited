// 📁 commands/ttsCommand.js – גרסה משולבת עם דו"ח מגבלה
const { SlashCommandBuilder } = require('discord.js');
const { synthesizeElevenTTS } = require('../tts/ttsEngine.elevenlabs');
const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  entersState,
  AudioPlayerStatus
} = require('@discordjs/voice');
const { Readable } = require('stream');
const {
  getTTSQuotaReport,
  shouldUseFallback,
  registerTTSUsage
} = require('../tts/ttsQuotaManager.eleven');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tts')
    .setDescription('השמע טקסט עם שמעון בערוץ הקולי')
    .addStringOption(option =>
      option.setName('טקסט')
        .setDescription('מה לומר?')
        .setRequired(true)
    ),

  async execute(interaction) {
    const text = interaction.options.getString('טקסט');
    const member = interaction.member;
    const channel = member.voice?.channel;

    if (!channel) {
      return interaction.reply({ content: '🔇 אתה לא נמצא בערוץ קולי.', ephemeral: true });
    }

    const blocked = await shouldUseFallback();
    if (blocked) {
      return interaction.reply({ content: '🚫 הגעת למגבלת שימוש יומית. נסה מאוחר יותר.', ephemeral: true });
    }

    try {
      const buffer = await synthesizeElevenTTS(text, 'shimon');
      await registerTTSUsage(text.length, 1);

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator
      });

      const resource = createAudioResource(Readable.from(buffer));
      const player = createAudioPlayer();
      connection.subscribe(player);
      player.play(resource);

      await entersState(player, AudioPlayerStatus.Idle, 15000);
      connection.destroy();

      const report = await getTTSQuotaReport();
      const dailyChars = report.dailyCharacters;
      const dailyCalls = report.dailyCalls;
      const monthly = report.monthlyCharacters;

      const statusLine = (label, data) => `• ${label}: ${data.used} / ${data.limit} ${data.status}`;

      const quotaSummary = [
        '🔊 סטטוס שימוש:',
        statusLine('תווים היום', dailyChars),
        statusLine('קריאות היום', dailyCalls),
        statusLine('החודש', monthly)
      ].join('\n');

      await interaction.reply({
        content: `✅ ההודעה הושמעה בהצלחה.\n\n${quotaSummary}`,
        ephemeral: true
      });
    } catch (err) {
      console.error('❌ שגיאה ב־TTS:', err);
      await interaction.reply({ content: '⚠️ שגיאה בהשמעה.', ephemeral: true });
    }
  }
};
