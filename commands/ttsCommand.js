// 📁 tts/ttsQuickPlay.js – נותר כפי שהוא (נראה תקין, תלוי ב-ttsEngine.elevenlabs.js)
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus
} = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { synthesizeElevenTTS } = require('../tts/ttsEngine.elevenlabs'); // ✅ ודא שנתיב הייבוא נכון

async function playTTSInVoiceChannel(channel, text, voice = 'shimon') {
  if (!channel || !channel.joinable) return;

  try {
    const fileName = `tts_${uuidv4()}.mp3`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);

    const buffer = await synthesizeElevenTTS(text, voice);
    fs.writeFileSync(filePath, buffer);

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);

    const resource = createAudioResource(filePath);
    const player = createAudioPlayer();

    connection.subscribe(player);
    player.play(resource);

    await entersState(player, AudioPlayerStatus.Idle, 15_000);

    connection.destroy();
    fs.unlink(filePath, () => null);
  } catch (err) {
    console.error('❌ שגיאה בהשמעת TTS:', err);
  }
}

module.exports = {
  playTTSInVoiceChannel
};