// 📁 handlers/musicControls.js (משוכתב מחדש לפי החזון שלך)
const { MessageFlags, EmbedBuilder } = require('discord.js');
const voiceQueue = require('./voiceQueue');
const { log } = require('../utils/logger');

async function handleMusicControls(interaction) {
  const { customId, guildId } = interaction;
  const serverQueue = voiceQueue.getQueue(guildId);

  // --- הגנה 1: האם המשתמש בערוץ קולי? ---
  if (!interaction.member.voice.channel) {
    return interaction.reply({ content: '🔇 עליך להיות בערוץ קולי כדי לשלוט בנגן.', flags: MessageFlags.Ephemeral });
  }
  
  // --- הגנה 2: האם בכלל יש נגן פעיל? ---
  // (פרט לכפתור "שיר נוסף", שמטופל בנפרד)
  if (!serverQueue && customId !== 'new_song') {
    await interaction.reply({ content: '🎵 אין כרגע שיר פעיל.', flags: MessageFlags.Ephemeral });
    return interaction.message.delete().catch(() => {}); // מנקה הודעה ישנה
  }

  try {
    // --- ✅ [תיקון] טיפול בכפתור "שיר נוסף" ---
    if (customId === 'new_song') {
        // מוחק את הודעת "השיר הסתיים"
        await interaction.message.delete().catch(() => {}); 
        // שולח הודעה זמנית שמנחה את המשתמש
        return interaction.reply({
            content: '🎵 להרצת שיר חדש, השתמש בפקודה: `/שירים`',
            flags: MessageFlags.Ephemeral
        });
    }

    // --- טיפול בכפתורי הנגן הפעיל ---
    const { player, nowPlayingMessage } = serverQueue;
    let content = '...';

    switch (customId) {
      case 'pause':
        if (player.pause()) {
          content = '⏸️ השיר הושהה.';
          // ✅ [שדרוג] עריכת ההודעה המקורית
          await voiceQueue.updateSongMessage(guildId, content, true); // true = isPaused
        } else {
          content = '❌ הנגן כבר מושהה.';
        }
        break;

      case 'resume':
        if (player.unpause()) {
          content = '▶️ הניגון ממשיך.';
          // ✅ [שדרוג] עריכת ההודעה המקורית
          await voiceQueue.updateSongMessage(guildId, content, false); // false = isPaused
        } else {
          content = '❌ הנגן כבר מנגן.';
        }
        break;

      case 'stop':
        content = '⏹️ הניגון הופסק והתור נוקה.';
        // ✅ [שדרוג] מחיקת הודעת הנגן, כפי שביקשת
        if (nowPlayingMessage) {
            await nowPlayingMessage.delete().catch(() => {});
            serverQueue.nowPlayingMessage = null;
        }
        voiceQueue.stop(guildId); // הפונקציה תנתק את הבוט
        break;
    }

    // שולח משוב זמני ללוחץ (בלי ספאם)
    await interaction.reply({ content: content, flags: MessageFlags.Ephemeral });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 3000); // מחיקת המשוב

  } catch (error) {
    log('❌ שגיאה ב-musicControls:', error);
    if (!interaction.replied) {
        await interaction.reply({ content: '❌ אירעה שגיאה בפעולת הנגן.', flags: MessageFlags.Ephemeral });
    }
  }
}

module.exports = handleMusicControls;