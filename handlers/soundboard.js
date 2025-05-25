const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, VoiceConnectionStatus, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const statTracker = require('./statTracker'); // ✅ חדש

// נתיב לתיקיית הסאונדים
const soundsDir = path.join(__dirname, '..', 'sounds');

// תור סאונדים לכל שרת
const guildQueues = new Map();
const guildConnections = new Map();
const guildPlayers = new Map();
const guildTimers = new Map();

// זמני המתנה
const COOLDOWN_SECONDS = 15;
const DISCONNECT_TIMEOUT = 10000;
const lastUsedTimestamps = new Map();

// זמינים לבחירה
const availableSounds = [
  { name: '🐐', value: 'goat' },
  { name: '🤯', value: 'headshot' },
  { name: '💥', value: 'boom' },
  { name: '👏', value: 'clap' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('סאונד')
    .setDescription('מפעיל סאונד קצר בערוץ הקולי')
    .addStringOption(opt =>
      opt
        .setName('שם')
        .setDescription('בחר סאונד')
        .setRequired(true)
        .addChoices(...availableSounds.map(s => ({ name: s.name, value: s.value })))
    ),

  async execute(interaction, client) {
    const userId = interaction.user.id;
    const now = Date.now();
    const lastUsed = lastUsedTimestamps.get(userId) || 0;

    if (now - lastUsed < COOLDOWN_SECONDS * 1000) {
      const secondsLeft = Math.ceil((COOLDOWN_SECONDS * 1000 - (now - lastUsed)) / 1000);
      return interaction.reply({
        content: `🕒 אנא המתן ${secondsLeft} שניות בין הפעלות.`,
        ephemeral: true
      });
    }

    const soundName = interaction.options.getString('שם');
    const filePath = path.join(soundsDir, `${soundName}.mp3`);
    if (!fs.existsSync(filePath)) {
      return interaction.reply({ content: '❌ הקובץ לא נמצא.', ephemeral: true });
    }

    const member = interaction.member;
    const channel = member.voice?.channel;
    if (!channel) {
      return interaction.reply({ content: '🔇 עליך להיות בערוץ קול כדי לשמוע את הסאונד.', ephemeral: true });
    }

    lastUsedTimestamps.set(userId, now);
    await statTracker.trackSoundUse(userId); // ✅ רישום שימוש בסאונד
    await interaction.reply({ content: `🎵 משמיע: ${soundName}` });

    const guildId = interaction.guild.id;

    // צור תור אם לא קיים
    if (!guildQueues.has(guildId)) {
      guildQueues.set(guildId, []);
    }

    const queue = guildQueues.get(guildId);
    queue.push({ filePath, channel });

    // הפעל אם לא מופעל
    if (!guildPlayers.has(guildId)) {
      processQueue(guildId);
    }
  }
};

// 🔁 מנגנון השמעה חכם
async function processQueue(guildId) {
  const queue = guildQueues.get(guildId);
  if (!queue || queue.length === 0) {
    guildPlayers.delete(guildId);

    // תזמן ניתוק
    if (guildConnections.has(guildId)) {
      const timer = setTimeout(() => {
        const conn = guildConnections.get(guildId);
        if (conn) conn.destroy();
        guildConnections.delete(guildId);
      }, DISCONNECT_TIMEOUT);
      guildTimers.set(guildId, timer);
    }

    return;
  }

  const { filePath, channel } = queue.shift();

  // עצור ניתוק אם יש
  const oldTimer = guildTimers.get(guildId);
  if (oldTimer) clearTimeout(oldTimer);

  let connection = guildConnections.get(guildId);
  if (!connection) {
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 5000);
      guildConnections.set(guildId, connection);
    } catch (err) {
      console.error('❌ שגיאה בהתחברות לערוץ:', err);
      return;
    }
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(fs.createReadStream(filePath), {
    inputType: StreamType.Arbitrary
  });

  connection.subscribe(player);
  guildPlayers.set(guildId, player);

  player.play(resource);
  player.once(AudioPlayerStatus.Idle, () => {
    guildPlayers.delete(guildId);
    processQueue(guildId); // המשך לתור הבא
  });

  player.once('error', err => {
    console.error('🎧 שגיאה בסאונד:', err);
    guildPlayers.delete(guildId);
    processQueue(guildId);
  });
}
