// 📁 fifoPodcastPlayer.js – ניהול תור פודקאסט FIFO עם שמעון ושירלי (גרסה מתקדמת)

const { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { Readable } = require('stream');
const { getScriptByUserId, fallbackScripts } = require('../data/fifoLines');
const { synthesizeGeminiTTS } = require('../tts/ttsEngine.gemini');
const { log } = require('../utils/logger');
const db = require('../utils/firebase');

const activeChannels = new Map();
const GREETER_CHANNEL_ID = '1231453923387379783';

async function handlePodcastGreeter(oldState, newState, client) {
  const member = newState.member;
  if (!member || member.user.bot) return;
  const channel = newState.channel;
  if (!channel || channel.id !== GREETER_CHANNEL_ID || channel.type !== 2) return;

  const members = [...channel.members.values()].filter(m => !m.user.bot);
  if (members.length < 4) return;

  const key = `${channel.guild.id}-${channel.id}`;
  if (activeChannels.has(key)) return;

  const today = new Date().toISOString().split('T')[0];
  const sysRef = db.collection('systemTasks').doc('daily');
  const sysSnap = await sysRef.get();
  const greeterCount = sysSnap.exists ? (sysSnap.data().greeterDailyCount || 0) : 0;
  if (sysSnap.exists && sysSnap.data().lastGreeter === today && greeterCount >= 3) {
    console.log('🛑 הגיע למגבלת פודקאסט יומית');
    return;
  }

  activeChannels.set(key, true);
  const userIds = members.map(m => m.user.id);
  const displayNames = members.map(m => m.displayName);
  const chosenId = userIds[Math.floor(Math.random() * userIds.length)];

  let script = getScriptByUserId(chosenId);
  if (!script) {
    script = fallbackScripts[Math.floor(Math.random() * fallbackScripts.length)];
    script.shimon += ` (נבחר fallback כי אין פרופיל מותאם ל־<@${chosenId}>)`;
  }

  // 🔍 משיכת מידע מהסטטיסטיקה (אם יש)
  let userStats = null;
  try {
    const statRef = db.collection('userStats').doc(chosenId);
    const statSnap = await statRef.get();
    if (statSnap.exists) userStats = statSnap.data();
  } catch (err) {
    console.warn('⚠️ לא ניתן למשוך סטטיסטיקה:', err.message);
  }

  try {
    const [shimon1, shirley, shimon2] = await Promise.all([
      synthesizeGeminiTTS(script.shimon, 'shimon'),
      synthesizeGeminiTTS(script.shirley, 'shirley'),
      synthesizeGeminiTTS(script.punch, 'shimon')
    ]);

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 5000);
    const player = createAudioPlayer();
    connection.subscribe(player);
    const buffers = [shimon1, shirley, shimon2];
    const initialUsers = new Set(userIds);
    let totalChars = (script.shimon + script.shirley + script.punch).length;

    const playNext = async () => {
      const next = buffers.shift();
      if (!next) {
        setTimeout(async () => {
          const finalUsers = [...channel.members.values()].filter(m => !m.user.bot && !initialUsers.has(m.user.id));
          if (finalUsers.length > 0) {
            const names = finalUsers.map(m => m.displayName).join(', ');
            const msg = `🎤 ${names} הצטרפו לפודקאסט באיחור אופייני.`;
            const textChannel = channel.guild.systemChannel;
            if (textChannel) textChannel.send(msg);
          }

          connection.destroy();
          activeChannels.delete(key);
        }, 1000);
        return;
      }
      const stream = Readable.from(next);
      const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
      player.play(resource);
      player.once(AudioPlayerStatus.Idle, () => playNext());
    };

    playNext();
    log(`🎧 פודקאסט הופעל ל־${displayNames.join(', ')} (user: ${chosenId})`);

    await db.collection('podcastSessions').add({
      timestamp: new Date().toISOString(),
      channelId: channel.id,
      startedWith: userIds,
      selectedUser: chosenId,
      displayNames,
      scriptUsed: script,
      charCount: totalChars,
      userStats: userStats || null
    });

    await sysRef.set({
      lastGreeter: today,
      greeterDailyCount: greeterCount + 1
    }, { merge: true });
  } catch (err) {
    console.error('❌ שגיאה בפודקאסט:', err);
    activeChannels.delete(key);

    const staff = await client.channels.fetch('881445829100060723');
    if (staff && staff.isTextBased()) {
      staff.send(`⚠️ שגיאה בפודקאסט ערוץ <#${channel.id}>: ${err.message}`);
    }
  }
}

module.exports = { handlePodcastGreeter };
