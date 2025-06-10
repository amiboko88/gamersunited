// 📁 utils/repartitionUtils.js
const { activeGroups } = require('./replayManager');
const { resetReplayVotes } = require('./replayManager');
const { playTTSInVoiceChannel } = require('./ttsQuickPlay');

async function executeReplayReset(guild, textChannel, teamName) {
  try {
    // 1. שליפת פרטי הקבוצה הנגדית (אם קיימת)
    const opponentGroup = [...activeGroups.entries()].find(([name]) => name !== teamName);

    if (opponentGroup) {
      const [_, opponentData] = opponentGroup;
      const voiceChannel = guild.channels.cache.get(opponentData.channelId);
      if (voiceChannel) {
        await playTTSInVoiceChannel(
          voiceChannel,
          `שחקני ${teamName} רוצים ריפליי. מה דעתכם ${opponentData.name}?`
        );
      }
    }

    // 2. החזרת כל המשתמשים לערוץ הראשי
    const fifoChannelId = '123456789012345678'; // 🛑 החלף ל-ID של ערוץ הפיפו
    const fifoChannel = guild.channels.cache.get(fifoChannelId);

    if (!fifoChannel || !fifoChannel.isVoiceBased()) return;

    for (const [, groupData] of activeGroups) {
      const { channelId, members } = groupData;
      const ch = guild.channels.cache.get(channelId);

      if (ch && ch.isVoiceBased()) {
        for (const memberId of members) {
          const member = await guild.members.fetch(memberId).catch(() => null);
          if (member && member.voice.channelId === ch.id) {
            await member.voice.setChannel(fifoChannel).catch(() => null);
          }
        }
      }

      // מחיקת הערוץ
      if (ch && ch.deletable) {
        await ch.delete().catch(() => null);
      }
    }

    // 3. איפוס מוחלט
    resetReplayVotes();

    // 4. שליחת הצעה לחלוקה מחדש
    await textChannel.send({
      content: '🎮 כל המשתמשים הוחזרו. מוכנים לחלוקה מחדש?',
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              custom_id: 'repartition_now',
              label: '🚀 חלקו מחדש'
            }
          ]
        }
      ]
    });
  } catch (err) {
    console.error('❌ שגיאה ב־executeReplayReset:', err);
  }
}

module.exports = {
  executeReplayReset
};
