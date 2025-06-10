// 📁 utils/ttsQuickPlay.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const azureTTS = require('./azureTTS'); // מניח שיש לך את azureTTS.synthesizeToFile
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

async function playTTSInVoiceChannel(channel, text, voice = 'avri') {
  if (!channel || !channel.joinable) return;

  try {
    const fileName = `tts_${uuidv4()}.mp3`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);

    // 📢 יצירת הקובץ באמצעות Azure
    await azureTTS.synthesizeToFile(text, filePath, voice);

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
    fs.unlink(filePath, () => null); // 🧹 מחיקת הקובץ לאחר השמעה
  } catch (err) {
    console.error('❌ שגיאה בהשמעת TTS:', err);
  }
}

module.exports = {
  playTTSInVoiceChannel
};
