const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  StreamType
} = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'music', `${songName}.mp3`);
const guildStates = new Map(); // guildId -> { player, connection, filePath, pausedAt }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('שיר')
    .setDescription('השמע שיר מתיקיית המוזיקה')
    .addStringOption(opt =>
      opt
        .setName('שם')
        .setDescription('בחר שם שיר')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const files = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'));

    const filtered = files
      .map(f => f.replace(/\\.mp3$/, ''))
      .filter(name => name.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    await interaction.respond(
      filtered.map(name => ({ name, value: name }))
    );
  },

  async execute(interaction) {
    const songName = interaction.options.getString('שם');
    const filePath = path.join(musicDir, `${songName}.mp3`);
    if (!fs.existsSync(filePath)) {
      return interaction.reply({ content: '❌ הקובץ לא נמצא.', ephemeral: true });
    }

    const member = interaction.member;
    const channel = member.voice?.channel;
    if (!channel) {
      return interaction.reply({ content: '🔇 עליך להיות בערוץ קול כדי לשמוע שיר.', ephemeral: true });
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 5000);
    } catch (err) {
      return interaction.reply({ content: '❌ לא ניתן להתחבר לערוץ.', ephemeral: true });
    }

    const player = createAudioPlayer();
    const resource = createAudioResource(fs.createReadStream(filePath), {
      inputType: StreamType.Arbitrary
    });

    connection.subscribe(player);
    player.play(resource);

    guildStates.set(interaction.guild.id, {
      connection,
      player,
      filePath,
      pausedAt: 0
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pause').setLabel('⏸️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('resume').setLabel('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('stop').setLabel('⏹️').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ content: `🎶 מנגן כעת: ${songName}`, components: [row] });

    player.once(AudioPlayerStatus.Idle, () => {
      guildStates.delete(interaction.guild.id);
      connection.destroy();
    });
  },

  getState(guildId) {
    return guildStates.get(guildId);
  },

  setPausedAt(guildId, millis) {
    const state = guildStates.get(guildId);
    if (state) state.pausedAt = millis;
  },

  resumePlayback(guildId) {
    const state = guildStates.get(guildId);
    if (!state) return;

    const { connection, filePath, pausedAt } = state;

    const player = createAudioPlayer();
    const resource = createAudioResource(fs.createReadStream(filePath), {
      inputType: StreamType.Arbitrary,
      seek: Math.floor(pausedAt / 1000)
    });

    connection.subscribe(player);
    player.play(resource);

    state.player = player;
    state.pausedAt = 0;

    player.once(AudioPlayerStatus.Idle, () => {
      guildStates.delete(guildId);
      connection.destroy();
    });
  },

  clearState(guildId) {
    const state = guildStates.get(guildId);
    if (state?.connection) state.connection.destroy();
    guildStates.delete(guildId);
  }
};
