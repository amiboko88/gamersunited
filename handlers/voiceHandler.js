
const { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { getUserProfileSSML, synthesizeAzureTTS } = require('../tts/ttsEngine');
const { enqueueTTS, ttsQueue, ttsIsPlaying, setTTSPlaying } = require('../utils/queueManager');

const TEST_CHANNEL = process.env.TTS_TEST_CHANNEL_ID;
let disconnectTimer = null;

async function handleVoiceStateUpdate(oldState, newState) {
  const joinedChannel = newState.channelId;
  const leftChannel = oldState.channelId;

  if (joinedChannel === TEST_CHANNEL && leftChannel !== TEST_CHANNEL) {
    const channel = newState.guild.channels.cache.get(TEST_CHANNEL);
    const username = newState.member.displayName;
    enqueueTTS({ channel, username });
    processQueue(channel);
  }
}

async function processQueue(channel) {
  if (ttsIsPlaying() || ttsQueue.length === 0) return;
  const { username } = ttsQueue.shift();
  setTTSPlaying(true);

  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 5000);

    const player = createAudioPlayer();
    connection.subscribe(player);

    const playNext = async () => {
      if (ttsQueue.length === 0) {
        disconnectTimer = setTimeout(() => {
          connection.destroy();
          setTTSPlaying(false);
        }, 10000);
        return;
      }

      const next = ttsQueue.shift();
      const ssml = getUserProfileSSML(next.username);
      const audioBuffer = await synthesizeAzureTTS(ssml);
      const resource = createAudioResource(audioBuffer, {
        inputType: StreamType.Arbitrary,
      });

      player.play(resource);
      player.once(AudioPlayerStatus.Idle, () => {
        clearTimeout(disconnectTimer);
        playNext();
      });
    };

    playNext();
  } catch (err) {
    console.error('❌ שגיאה בתהליך ההשמעה:', err);
    setTTSPlaying(false);
  }
}

module.exports = { handleVoiceStateUpdate };
