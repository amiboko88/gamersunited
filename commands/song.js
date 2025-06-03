// 📁 commands/שיר.js
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
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

// נתיב לתיקיית השירים
const musicDir = path.join(__dirname, '..', 'music');

// זיכרון נגן לפי שרת
const players = new Map(); // guildId → { player, connection, pausedAt }

function getState(guildId) {
  return players.get(guildId);
}

function setState(guildId, state) {
  players.set(guildId, state);
}

function setPausedAt(guildId, pausedAt) {
  const state = players.get(guildId);
  if (state) state.pausedAt = pausedAt;
}

function resumePlayback(guildId) {
  const state = players.get(guildId);
  if (!state) throw new Error('אין מצב נגן');
  state.player.unpause();
}

function clearState(guildId) {
  const state = players.get(guildId);
  if (state?.connection) state.connection.destroy();
  players.delete(guildId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('מוזיקה')
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

    await interaction.deferReply();

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

    // שמור את המצב
    setState(channel.guild.id, { player, connection });

    // שליחת Embed עם כפתורים
    const embed = new EmbedBuilder()
      .setColor('Purple')
      .setTitle('🎶 מתנגן עכשיו')
      .setDescription(`**${songName}**`)
      .setFooter({ text: 'שמעון נגן – מוזיקה איכותית בלבד 🎧' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pause')
        .setLabel('השהה')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('resume')
        .setLabel('המשך')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('stop')
        .setLabel('עצור')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.editReply({ embeds: [embed], components: [row] });

    player.on(AudioPlayerStatus.Idle, () => {
      clearState(channel.guild.id);
    });

    player.on('error', err => {
      console.error('שגיאת נגן:', err);
      clearState(channel.guild.id);
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
  },

  // ייצוא פונקציות שליטה
  getState,
  setPausedAt,
  resumePlayback,
  clearState
};
