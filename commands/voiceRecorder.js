const {
  joinVoiceChannel,
  EndBehaviorType,
} = require('@discordjs/voice');
const { createWriteStream, existsSync, mkdirSync, unlinkSync, statSync } = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const sodium = require('libsodium-wrappers');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require('discord.js');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR);

const ALLOWED_ROLE_IDS = [
  '1372701819167440957', // MVP
  '853024162603597886',  // BOOSTER
  '1133753472966201555'  // ADMIN
];

const dailyLimits = new Map();

function canRecord(member) {
  return member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id));
}

function getUserDailyKey(userId) {
  return `${userId}_${dayjs().format('YYYY-MM-DD')}`;
}

function getUserDailyCount(userId) {
  return dailyLimits.get(getUserDailyKey(userId)) || 0;
}

function incrementUserCount(userId) {
  const key = getUserDailyKey(userId);
  dailyLimits.set(key, getUserDailyCount(userId) + 1);
}

async function convertPcmToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn(ffmpeg, [
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      '-i', inputPath,
      '-y',
      outputPath
    ]);

    ffmpegProcess.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });

    ffmpegProcess.on('error', reject);
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('הקלטה')
    .setDescription('מקליט את הערוץ שלך ל־30 שניות (רק למורשים)'),

  async execute(interaction) {
    await sodium.ready;

    const member = interaction.member;
    if (!canRecord(member)) {
      return interaction.reply({
        content: '❌ אין לך הרשאה להקליט. נדרש תפקיד MVP / Booster / Admin.',
        ephemeral: true
      });
    }

    if (!member.voice.channel) {
      return interaction.reply({
        content: '🔇 אתה חייב להיות בערוץ קול.',
        ephemeral: true
      });
    }

    if (getUserDailyCount(member.id) >= 5) {
      return interaction.reply({
        content: '🛑 הגעת למכסת ההקלטות היומית שלך (5).',
        ephemeral: true
      });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_recording')
        .setLabel('✅ אשר הקלטה')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      content: '🎙️ אתה עומד להקליט את הערוץ שלך ל־30 שניות.\nלחץ כדי לאשר.',
      components: [confirmRow],
      ephemeral: true
    });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.customId === 'confirm_recording' && i.user.id === interaction.user.id,
      time: 15000,
      max: 1
    });

    collector.on('collect', async i => {
      await i.update({
        content: '⏺️ ההקלטה החלה. המתן 30 שניות...',
        components: []
      });

      const connection = joinVoiceChannel({
        channelId: member.voice.channel.id,
        guildId: member.guild.id,
        adapterCreator: member.guild.voiceAdapterCreator,
        selfDeaf: false, // 🧠 חובה! הבוט לא יהיה מנותק!
        selfMute: false
      });

      const receiver = connection.receiver;
      const timestamp = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const safeName = interaction.user.username.replace(/[^a-zA-Z0-9]/g, '');
      const baseName = `${timestamp}_${safeName}`;
      const userDir = path.join(RECORDINGS_DIR, member.id);
      if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });

      const rawPath = path.join(userDir, `${baseName}.pcm`);
      const mp3Path = path.join(userDir, `${baseName}.mp3`);
      const streams = new Map();

      receiver.speaking.on('start', userId => {
        if (streams.has(userId)) return;

        const audioStream = receiver.subscribe(userId, {
          end: { behavior: EndBehaviorType.AfterSilence, duration: 100 }
        });

        const writeStream = createWriteStream(rawPath, { flags: 'a' });
        audioStream.pipe(writeStream);
        streams.set(userId, writeStream);

        console.log(`[RECORDING] קולט את המשתמש ${userId}`);
        audioStream.on('end', () => {
          writeStream.end();
          streams.delete(userId);
        });
      });

      setTimeout(async () => {
        try {
          connection.destroy();

          if (!existsSync(rawPath)) {
            return interaction.followUp({
              content: '❌ לא נוצר קובץ הקלטה. ודא שמישהו דיבר בערוץ.',
              ephemeral: true
            });
          }

          const stats = statSync(rawPath);
          if (stats.size < 1024) {
            unlinkSync(rawPath);
            return interaction.followUp({
              content: '❌ הקובץ היה ריק. ודא שהיה קול בערוץ.',
              ephemeral: true
            });
          }

          await convertPcmToMp3(rawPath, mp3Path);
          unlinkSync(rawPath);
          incrementUserCount(member.id);

          await interaction.followUp({
            content: `✅ ההקלטה נשמרה כ־MP3: \`${baseName}.mp3\``,
            ephemeral: true
          });

          console.log(`[RECORDING] Saved: ${mp3Path}`);
        } catch (err) {
          console.error('שגיאה בהמרה או סיום הקלטה:', err);
          await interaction.followUp({
            content: '❌ שגיאה במהלך ההקלטה או ההמרה.',
            ephemeral: true
          });
        }
      }, 30_000);
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.editReply({
          content: '⌛ ההקלטה בוטלה – לא התקבלה לחיצה בזמן.',
          components: []
        });
      }
    });
  }
};
