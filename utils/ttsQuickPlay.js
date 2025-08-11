// 📁 utils/ttsQuickPlay.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { log } = require('../utils/logger');
const { Readable } = require('stream');
const { synthesizeTTS } = require('../tts/ttsEngine.elevenlabs.js'); // שימוש במנוע החדש

async function playTTSInVoiceChannel(channel, text) {
  if (!channel || !channel.joinable) {
    log(`⚠️ ניסיון להשמיע TTS בערוץ לא תקין: ${channel?.name}`);
    return;
  }
  let connection;
  try {
    const audioBuffer = await synthesizeTTS(text, 'shimon_energetic'); // קריאה לפונקציה החדשה
    if (!audioBuffer) throw new Error('Audio buffer is empty');
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
    const resource = createAudioResource(Readable.from(audioBuffer));
    const player = createAudioPlayer();
    connection.subscribe(player);
    player.play(resource);
    await entersState(player, AudioPlayerStatus.Idle, 15_000);
  } catch (error) {
    log(`❌ שגיאה בהשמעת TTS מהיר:`, error);
  } finally {
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      connection.destroy();
    }
  }
}
module.exports = { playTTSInVoiceChannel };