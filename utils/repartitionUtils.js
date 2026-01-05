// 📁 utils/repartitionUtils.js
const { activeGroups, resetReplayVotes } = require('./replayManager');
const { playTTSInVoiceChannel } = require('./ttsQuickPlay'); // ודא שקובץ זה קיים ב-utils

// ה-ID של ערוץ ה-FIFO הראשי (לובי המתנה)
const FIFO_CHANNEL_ID = process.env.FIFO_CHANNEL_ID || '1231453923387379783';

/**
 * מבצע איפוס וחלוקה מחדש (Replay) לקבוצה
 */
async function executeReplayReset(guild, textChannel, teamName) {
  try {
    // 1. הודעה קולית לקבוצה היריבה (אם יש)
    const opponentGroup = [...activeGroups.entries()].find(([name]) => name !== teamName);

    if (opponentGroup) {
      const [_, opponentData] = opponentGroup;
      const voiceChannel = guild.channels.cache.get(opponentData.channelId);
      if (voiceChannel) {
        await playTTSInVoiceChannel(
          voiceChannel,
          `שחקני ${teamName} רוצים ריפליי. מתכוננים לחלוקה מחדש!`
        );
      }
    }

    // 2. החזרת כל המשתמשים לערוץ הראשי (FIFO)
    const fifoChannel = guild.channels.cache.get(FIFO_CHANNEL_ID);

    if (!fifoChannel || !fifoChannel.isVoiceBased()) {
        console.error('❌ ערוץ FIFO הראשי לא נמצא או אינו ערוץ קולי.');
        if (textChannel) await textChannel.send('⚠️ שגיאה: לא ניתן להחזיר שחקנים (ערוץ ראשי חסר).');
        return;
    }

    // עוברים על כל הקבוצות הפעילות
    for (const [, groupData] of activeGroups) {
      const { channelId, members } = groupData;
      const ch = guild.channels.cache.get(channelId);

      // העברת שחקנים
      if (ch && ch.isVoiceBased()) {
        for (const memberId of members) {
          const member = await guild.members.fetch(memberId).catch(() => null);
          if (member && member.voice.channelId === ch.id) {
            await member.voice.setChannel(fifoChannel).catch(err => 
                console.warn(`לא הצלחתי להעביר את ${member.displayName}: ${err.message}`)
            );
          }
        }
      }

      // מחיקת הערוץ הזמני
      if (ch && ch.deletable) {
        await ch.delete().catch(() => null);
      }
    }

    // 3. איפוס המערכת
    resetReplayVotes();

    // 4. הודעה בטקסט
    if (textChannel) {
        await textChannel.send({
            content: '🎮 **בוצע איפוס למשחק!**\nכל השחקנים הוחזרו ללובי לחלוקה מחדש.'
        });
    }

  } catch (error) {
    console.error('❌ Error in executeReplayReset:', error);
  }
}

module.exports = { executeReplayReset };