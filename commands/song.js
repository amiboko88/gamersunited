const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, VoiceConnectionStatus, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

// נתיב לתיקיית השירים
const musicDir = path.join(__dirname, '..', 'music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('שיר')
    .setDescription('השמע שיר מהשרת')
    .addStringOption(option =>
      option
        .setName('שם')
        .setDescription('בחר שיר')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const songName = interaction.options.getString('שם');
    const filePath = path.join(musicDir, `${songName}.mp3`);

    if (!fs.existsSync(filePath)) {
      return interaction.reply({ content: '❌ הקובץ לא נמצא.', ephemeral: true });
    }

    const member = interaction.member;
    const channel = member.voice?.channel;
    if (!channel) {
      return interaction.reply({ content: '🔇 אתה לא בערוץ קולי.', ephemeral: true });
    }

    await interaction.reply({ content: `🎵 מפעיל את: **${songName}**` });

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);

    const player = createAudioPlayer();
    const resource = createAudioResource(fs.createReadStream(filePath), {
      inputType: StreamType.Arbitrary
    });

    player.play(resource);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      connection.destroy();
    });

    player.on('error', err => {
      console.error('שגיאת נגן:', err);
      connection.destroy();
    });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const files = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'));

    const choices = files.map(file => path.parse(file).name);
    const filtered = choices.filter(c => c.toLowerCase().includes(focused.toLowerCase()));

    await interaction.respond(
      filtered.slice(0, 25).map(name => ({ name, value: name }))
    );
  }
};
