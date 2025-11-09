// 📁 handlers/musicControls.js (הלוגיקה החדשה לכפתורים)
const { MessageFlags } = require('discord.js');
const voiceQueue = require('./voiceQueue');
const { log } = require('../utils/logger');

async function handleMusicControls(interaction) {
  const { customId, guildId } = interaction;

  if (!interaction.member.voice.channel) {
    return interaction.reply({ content: '🔇 עליך להיות בערוץ קולי כדי לשלוט בנגן.', flags: MessageFlags.Ephemeral });
  }

  // ✅ [שדרוג] מאחזר את התור הנוכחי
  const serverQueue = voiceQueue.getQueue(guildId);
  if (!serverQueue || !serverQueue.nowPlayingMessage) {
    return interaction.reply({ content: '🎵 אין כרגע שיר פעיל.', flags: MessageFlags.Ephemeral });
  }

  let success = false;
  let content = '...';

  try {
    switch (customId) {
      case 'pause':
        success = voiceQueue.pause(guildId);
        content = success ? '⏸️ השיר הושהה.' : '❌ הנגן כבר מושהה.';
        if (success) {
          // ✅ [שדרוג] עדכון ההודעה עם הכפתורים החדשים (כפתור Play)
          await voiceQueue.updateSongMessage(guildId, content, true);
        }
        break;

      case 'resume':
        success = voiceQueue.resume(guildId);
        content = success ? '▶️ הניגון ממשיך.' : '❌ הנגן כבר מנגן.';
        if (success) {
          // ✅ [שדרוג] עדכון ההודעה עם הכפתורים החדשים (כפתור Pause)
          await voiceQueue.updateSongMessage(guildId, content, false);
        }
        break;

      case 'stop':
        success = voiceQueue.stop(guildId);
        content = success ? '⏹️ הניגון הופסק והתור נוקה.' : '❌ לא היה מה לעצור.';
        // ההודעה נמחקת אוטומטית על ידי פונקציית stop
        break;
        
      case 'new_song':
        // ✅ [שדרוג] טיפול בכפתור "שיר נוסף"
        await interaction.message.delete().catch(() => {}); // מחיקת הודעת "השיר הסתיים"
        return interaction.reply({
            content: '🎵 להרצת שיר חדש, השתמש בפקודה: `/שירים`',
            flags: MessageFlags.Ephemeral
        });
    }

    // ✅ [שדרוג] שליחת עדכון זמני למשתמש שלחץ
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