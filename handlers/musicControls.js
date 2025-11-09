// 📁 handlers/musicControls.js (הלוגיקה החדשה לכפתורים)
const { MessageFlags } = require('discord.js');
const voiceQueue = require('./voiceQueue');
const { log } = require('../utils/logger');

async function handleMusicControls(interaction) {
  const { customId, guildId } = interaction;
  const serverQueue = voiceQueue.getQueue(guildId);

  // --- הגנה 1: האם המשתמש בערוץ קולי? ---
  if (!interaction.member.voice.channel) {
    return interaction.reply({ content: '🔇 עליך להיות בערוץ קולי כדי לשלוט בנגן.', flags: MessageFlags.Ephemeral });
  }
  
  // --- ✅ [תיקון] טיפול בכפתור "שיר נוסף" (פותר את ה-Interaction Failed) ---
  if (customId === 'new_song') {
      // עונה לאינטראקציה מיד
      await interaction.reply({
          content: '🎵 להרצת שיר חדש, השתמש בפקודה: `/שירים`',
          flags: MessageFlags.Ephemeral
      });
      // מנסה למחוק את ההודעה הישנה (ולא נכשל אם היא כבר נמחקה)
      await interaction.message.delete().catch(() => {}); 
      return;
  }

  // --- הגנה 2: האם בכלל יש נגן פעיל? ---
  if (!serverQueue || !serverQueue.nowPlayingMessage) {
    await interaction.reply({ content: '🎵 אין כרגע שיר פעיל.', flags: MessageFlags.Ephemeral });
    return interaction.message.delete().catch(() => {}); // מנקה הודעה ישנה
  }

  try {
    // --- טיפול בכפתורי הנגן הפעיל ---
    const { nowPlayingMessage } = serverQueue;
    let success = false;
    let content = '...';

    // הגנה 3: האם ההודעה שאתה לוחץ עליה היא ההודעה הנכונה?
    if (interaction.message.id !== nowPlayingMessage.id) {
        return interaction.reply({ content: '❌ זוהי הודעת נגן ישנה. השתמש בפקודה `/שירים` מחדש.', flags: MessageFlags.Ephemeral });
    }

    switch (customId) {
      case 'pause':
        success = voiceQueue.pause(guildId);
        content = success ? '⏸️ השיר הושהה.' : '❌ הנגן כבר מושהה.';
        if (success) {
          // ✅ [שדרוג] עדכון ההודעה המקורית (כפתור Play)
          await voiceQueue.updateSongMessage(guildId, content, true); // true = isPaused
        }
        break;

      case 'resume':
        success = voiceQueue.resume(guildId);
        content = success ? '▶️ הניגון ממשיך.' : '❌ הנגן כבר מנגן.';
        if (success) {
          // ✅ [שדרוג] עדכון ההודעה המקורית (כפתור Pause)
          await voiceQueue.updateSongMessage(guildId, content, false); // false = isPaused
        }
        break;

      case 'stop':
        success = voiceQueue.stop(guildId);
        content = success ? '⏹️ הניגון הופסק והתור נוקה.' : '❌ לא היה מה לעצור.';
        // ההודעה נמחקת אוטומטית על ידי פונקציית stop
        break;
    }

    // ✅ [שדרוג] שליחת עדכון זמני למשתמש שלחץ (בלי ספאם)
    if (interaction.replied) return;
    // משתמש ב-interaction.update() במקום reply() כדי למנוע ספאם
    await interaction.update({ content: ' ' }); // מאפס את תוכן הלחיצה
    const tempReply = await interaction.followUp({ content: content, flags: MessageFlags.Ephemeral });
    setTimeout(() => tempReply.delete().catch(() => {}), 3000); // מחיקת המשוב

  } catch (error) {
    log('❌ שגיאה ב-musicControls:', error);
    if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ אירעה שגיאה בפעולת הנגן.', flags: MessageFlags.Ephemeral });
    }
  }
}

module.exports = handleMusicControls;