// 📁 fifoPodcastPlayer.js – ניהול תור פודקאסט FIFO עם שמעון ושירלי

const { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { Readable } = require('stream');
const { getScriptByUserId } = require('../data/fifoLines'); // ← שינוי כאן!
const { synthesizeGeminiTTS } = require('../tts/ttsEngine.gemini');
const { log } = require('../utils/logger');

const activeChannels = new Map();

async function handlePodcastGreeter(oldState, newState, client) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const channel = newState.channel;
  if (!channel || channel.type !== 2) return; // Voice only
  const members = [...channel.members.values()].filter(m => !m.user.bot);
  if (members.length < 4) return;

  const key = `${channel.guild.id}-${channel.id}`;
  if (activeChannels.has(key)) return;

  activeChannels.set(key, true);

  // ---- התיקון המרכזי ----
  const userIds = members.map(m => m.user.id);
  const chosenId = userIds[Math.floor(Math.random() * userIds.length)];
  const script = getScriptByUserId(chosenId);

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

    const playNext = () => {
      const next = buffers.shift();
      if (!next) {
        setTimeout(() => {
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
    log(`🎧 פודקאסט הופעל ל־${members.map(m => m.displayName).join(', ')} (user: ${chosenId})`);
  } catch (err) {
    console.error('❌ שגיאה בפודקאסט:', err);
    activeChannels.delete(key);
  }
}

module.exports = { handlePodcastGreeter };
