// 📁 commands/voiceRecorder.js (מתוקן עם מפענח Opus ומיקסוס)
const {
  joinVoiceChannel,
  EndBehaviorType,
  VoiceConnectionStatus, // ✅ כבר לא יהיה אפור
  entersState // ✅ כבר לא יהיה אפור
} = require('@discordjs/voice');
const { createWriteStream, existsSync, mkdirSync, unlinkSync, statSync, readdirSync } = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const sodium = require('libsodium-wrappers');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, MessageFlags } = require('discord.js');
const { log } = require('../utils/logger');
const prism = require('prism-media'); // ✅ [תיקון קריטי] ייבוא המפענח

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR);

const ALLOWED_ROLE_IDS = [
  '1372701819167440957', // MVP
  '853024162603597886',  // BOOSTER
  '1133753472966201555'  // ADMIN
];

const dailyLimits = new Map();

// ... (פונקציות העזר canRecord, getUserDailyKey וכו' נשארות זהות) ...
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
// -------------------------------------------------------------------

async function convertPcmToMp3(inputPaths, outputPath) {
  return new Promise((resolve, reject) => {
    if (inputPaths.length === 0) {
      return reject(new Error('לא סופקו קבצי PCM להמרה.'));
    }

    const ffmpegArgs = [
      '-f', 's16le', '-ar', '48000', '-ac', '2', // הגדרות גלובליות לכל קבצי ה-input
    ];

    inputPaths.forEach(p => ffmpegArgs.push('-i', p));

    ffmpegArgs.push(
      '-filter_complex', `amix=inputs=${inputPaths.length}:duration=longest`,
      '-y', 
      outputPath
    );

    log(`[FFMPEG] מריץ פקודת מיקסוס עם ${inputPaths.length} קבצים...`);
    const ffmpegProcess = spawn(ffmpeg, ffmpegArgs);

    ffmpegProcess.stderr.on('data', (data) => {
      log(`[FFMPEG_STDERR]: ${data.toString()}`); // המרת הבאפר לסטרינג
    });
    ffmpegProcess.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg (amix) exited with code ${code}`));
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
        flags: MessageFlags.Ephemeral
      });
    }

    if (!member.voice.channel) {
      return interaction.reply({
        content: '🔇 אתה חייב להיות בערוץ קול.',
        flags: MessageFlags.Ephemeral
      });
    }

    if (getUserDailyCount(member.id) >= 5) {
      return interaction.reply({
        content: '🛑 הגעת למכסת ההקלטות היומית שלך (5).',
        flags: MessageFlags.Ephemeral
      });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_recording')
        .setLabel('✅ אשר הקלטה (30 שניות)')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      content: '🎙️ אתה עומד להקליט את **כל מי שידבר** בערוץ למשך 30 שניות.\nלחץ כדי לאשר.',
      components: [confirmRow],
      flags: MessageFlags.Ephemeral
    });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.customId === 'confirm_recording' && i.user.id === interaction.user.id,
      time: 15000,
      max: 1
    });

    collector.on('collect', async i => {
      await i.update({
        content: '⏺️ ההקלטה החלה. כולם בערוץ מוקלטים עכשיו! (30 שניות)...',
        components: []
      });

      const connection = joinVoiceChannel({
        channelId: member.voice.channel.id,
        guildId: member.guild.id,
        adapterCreator: member.guild.voiceAdapterCreator,
        selfDeaf: false, 
        selfMute: false
      });
      
      // --- ✅ [תיקון קריטי] לוגיקת הקלטה רב-ערוצית עם מפענח ---
      try {
        // ✅ [תיקון] ממתינים שהחיבור יהיה מוכן
        await entersState(connection, VoiceConnectionStatus.Ready, 5_000); 
      } catch (error) {
        log('❌ [RECORDING] שגיאה בהתחברות לערוץ:', error);
        return i.followUp({ content: '❌ שגיאה בהתחברות לערוץ הקולי.', flags: MessageFlags.Ephemeral });
      }

      const receiver = connection.receiver;
      const timestamp = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const safeName = interaction.user.username.replace(/[^a-zA-Z0-9]/g, '');
      const baseName = `${timestamp}_${safeName}`;
      const userDir = path.join(RECORDINGS_DIR, member.id);
      if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });

      const mp3Path = path.join(userDir, `${baseName}.mp3`);
      const audioStreams = new Map();

      receiver.speaking.on('start', (userId) => {
        if (audioStreams.has(userId)) return;

        log(`[RECORDING] קולט את המשתמש ${userId}`);
        const pcmPath = path.join(userDir, `${baseName}_${userId}.pcm`);
        const writeStream = createWriteStream(pcmPath);
        
        // 1. קבל את זרם האודיו המוצפן (Opus)
        const opusStream = receiver.subscribe(userId, {
          end: { behavior: EndBehaviorType.AfterSilence, duration: 100 }
        });

        // 2. ✅ [תיקון] צור מפענח Opus
        const pcmStream = new prism.opus.Decoder({
          rate: 48000,
          channels: 2,
          frameSize: 960
        });

        // 3. שמור את כל הזרמים כדי שנוכל לסגור אותם
        audioStreams.set(userId, { writeStream, opusStream, pcmStream, pcmPath });
        
        // 4. חבר את הצינור: Opus -> מפענח -> קובץ PCM
        opusStream.pipe(pcmStream).pipe(writeStream);

        opusStream.on('end', () => {
            log(`[RECORDING] זרם אודיו (Opus) עבור ${userId} הסתיים.`);
        });
      });
      // ------------------------------------------

      setTimeout(async () => {
        try {
          connection.destroy();
          
          audioStreams.forEach(streams => {
            streams.opusStream.destroy();
            streams.pcmStream.destroy();
            streams.writeStream.end();
          });
          
          const pcmFilesToMix = Array.from(audioStreams.values()).map(s => s.pcmPath);

          await new Promise(resolve => setTimeout(resolve, 1000)); // תן לקבצים להיסגר

          if (pcmFilesToMix.length === 0) {
            return interaction.followUp({
              content: '❌ לא נקלט אודיו מאף משתמש במהלך 30 השניות.',
              flags: MessageFlags.Ephemeral
            });
          }
          
          const validPcmFiles = pcmFilesToMix.filter(p => {
              if (existsSync(p) && statSync(p).size > 1024) {
                  return true;
              }
              if (existsSync(p)) unlinkSync(p); // מחק קובץ ריק
              return false;
          });
          
          if (validPcmFiles.length === 0) {
             return interaction.followUp({
              content: '❌ הקובץ היה ריק. ודא שהיה קול בערוץ.',
              flags: MessageFlags.Ephemeral
            });
          }

          await convertPcmToMp3(validPcmFiles, mp3Path);
          validPcmFiles.forEach(p => unlinkSync(p));
          incrementUserCount(member.id);

          await interaction.followUp({
            content: `✅ ההקלטה הקבוצתית נשמרה כ־MP3: \`${baseName}.mp3\``,
            flags: MessageFlags.Ephemeral
          });

          console.log(`[RECORDING] Saved: ${mp3Path}`);
        } catch (err) {
          console.error('שגיאה בהמרה או סיום הקלטה:', err);
          await interaction.followUp({
            content: '❌ שגיאה במהלך ההקלטה או ההמרה.',
            flags: MessageFlags.Ephemeral
          });
          // נקה קבצי זבל
          readdirSync(userDir).filter(f => f.includes(baseName)).forEach(f => unlinkSync(path.join(userDir, f)));
        }
      }, 30_000); // 30 שניות הקלטה
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