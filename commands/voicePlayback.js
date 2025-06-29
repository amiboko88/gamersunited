const fs = require('fs');
const path = require('path');
const {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  AudioPlayerStatus,
  StreamType
} = require('@discordjs/voice');
const { SlashCommandBuilder } = require('discord.js');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voiceplayback')
    .setDescription('משמיע את ההקלטה האחרונה שלך (MP3)'),

  async execute(interaction) {
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '🔇 אתה חייב להיות בערוץ קול כדי להשמיע הקלטה.',
        ephemeral: true
      });
    }

    const userDir = path.join(RECORDINGS_DIR, member.id);
    if (!fs.existsSync(userDir)) {
      return interaction.reply({ content: '❌ לא נמצאו הקלטות שמורות עבורך.', ephemeral: true });
    }

    const files = fs.readdirSync(userDir)
      .filter(f => f.endsWith('.mp3'))
      .sort((a, b) => fs.statSync(path.join(userDir, b)).mtimeMs - fs.statSync(path.join(userDir, a)).mtimeMs);

    if (files.length === 0) {
      return interaction.reply({ content: '📭 אין הקלטות MP3 זמינות עבורך.', ephemeral: true });
    }

    const lastFile = path.join(userDir, files[0]);

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator
    });

    const player = createAudioPlayer();
    const resource = createAudioResource(lastFile, { inputType: StreamType.Arbitrary });

    connection.subscribe(player);
    player.play(resource);

    await interaction.reply({
      content: `🎧 משמיע כעת את ההקלטה האחרונה שלך: \`${files[0]}\``,
      ephemeral: true
    });

    player.on(AudioPlayerStatus.Idle, () => {
      connection.destroy();
    });

    player.on('error', error => {
      console.error('שגיאה בהשמעה:', error);
      connection.destroy();
    });
  }
};
