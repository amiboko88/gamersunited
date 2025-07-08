const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus,
  StreamType
} = require('@discordjs/voice');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
const ADMIN_ROLE_ID = '1133753472966201555';
const playbackCache = new Map(); // userId → fileName

module.exports = {
  data: new SlashCommandBuilder()
    .setName('הקלטות')
    .setDescription('נהל את ההקלטות האישיות שלך'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const userDir = path.join(RECORDINGS_DIR, userId);

    if (!fs.existsSync(userDir)) {
      return interaction.reply({ content: '📭 אין הקלטות שמורות עבורך.', flags: MessageFlags.Ephemeral });
    }

    const files = fs.readdirSync(userDir)
      .filter(f => f.endsWith('.mp3'))
      .sort((a, b) => fs.statSync(path.join(userDir, b)).mtimeMs - fs.statSync(path.join(userDir, a)).mtimeMs)
      .slice(0, 20);

    if (files.length === 0) {
      return interaction.reply({ content: '📭 אין קבצי MP3 זמינים.', flags: MessageFlags.Ephemeral });
    }

    const options = files.map((f, i) => {
      const stats = fs.statSync(path.join(userDir, f));
      const label = `הקלטה ${i + 1} – ${dayjs(stats.mtime).format('DD/MM HH:mm')}`;
      return { label, value: f };
    });

    const select = new StringSelectMenuBuilder()
      .setCustomId('select_voice')
      .setPlaceholder('בחר הקלטה מהרשימה')
      .addOptions(options);

    const row1 = new ActionRowBuilder().addComponents(select);
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('play_voice_selected')
        .setLabel('🎧 השמע')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('delete_voice_selected')
        .setLabel('🗑️ מחק')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      content: '🎙️ ניהול הקלטות אישיות:',
      components: [row1, row2],
      flags: MessageFlags.Ephemeral
    });
  },

  handleInteraction: async (interaction, client) => {
    const userId = interaction.user.id;
    const userDir = path.join(RECORDINGS_DIR, userId);

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_voice') {
      playbackCache.set(userId, interaction.values[0]);
      return interaction.reply({
        content: `📁 נבחרה ההקלטה: \`${interaction.values[0]}\``,
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.isButton()) {
      const fileName = playbackCache.get(userId);
      if (!fileName) {
        return interaction.reply({ content: '⚠️ לא נבחרה הקלטה.', flags: MessageFlags.Ephemeral });
      }

      const filePath = path.join(userDir, fileName);
      if (!fs.existsSync(filePath)) {
        return interaction.reply({ content: '📭 לא נמצא קובץ ההקלטה שנבחר.', flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'play_voice_selected') {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
          return interaction.reply({ content: '🔇 אתה חייב להיות בערוץ קול.', flags: MessageFlags.Ephemeral });
        }

        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });

        try {
          await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
        } catch (err) {
          console.error('❌ שגיאה בהתחברות קולית:', err);
          return interaction.reply({ content: '❌ שגיאה בהתחברות לערוץ.', flags: MessageFlags.Ephemeral });
        }

        const player = createAudioPlayer();
        const resource = createAudioResource(fs.createReadStream(filePath), {
          inputType: StreamType.Unknown // עדיף לזיהוי אוטומטי
        });

        connection.subscribe(player);
        player.play(resource);

        player.on(AudioPlayerStatus.Idle, () => connection.destroy());
        player.on('error', err => {
          console.error('🎧 שגיאה בהשמעה:', err);
          connection.destroy();
        });

        console.log(`[PLAYBACK] ${interaction.user.tag} השמיע את הקובץ ${fileName}`);
        return interaction.reply({ content: `🎧 מנגן כעת: \`${fileName}\``, flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'delete_voice_selected') {
        const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE_ID);
        if (!isAdmin && interaction.user.id !== interaction.member.id) {
          return interaction.reply({
            content: '🚫 רק מנהלים יכולים למחוק הקלטות.',
            flags: MessageFlags.Ephemeral
          });
        }

        try {
          fs.unlinkSync(filePath);
          playbackCache.delete(userId);
          return interaction.reply({
            content: `🗑️ ההקלטה \`${fileName}\` נמחקה בהצלחה.`,
            flags: MessageFlags.Ephemeral
          });
        } catch (err) {
          console.error('🗑️ שגיאה במחיקת ההקלטה:', err);
          return interaction.reply({
            content: '❌ לא ניתן למחוק את ההקלטה.',
            flags: MessageFlags.Ephemeral
          });
        }
      }
    }
  }
};
