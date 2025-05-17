// 📁 handlers/interactionGreeter.js – שימי מגיב כשהחבר'ה מתקבצים
const {
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType
} = require('@discordjs/voice');
const { Readable } = require('stream');
const { synthesizeElevenTTS, getRandomElevenLine } = require('../tts/ttsEngine.eleven');
const { ChannelType } = require('discord.js');
const { log } = require('../utils/logger');
const MAIN_TEXT_CHANNEL_ID = '1372283521447497759';

const recentTriggers = new Map(); // anti-repeat

async function handleVoiceJoinGreeter(oldState, newState, client) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const channel = newState.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  if (channel.members.filter(m => !m.user.bot).size < 3) return;
  if (channel.id === process.env.TTS_TEST_CHANNEL_ID) return;

  const key = `${channel.guild.id}-${channel.id}`;
  const now = Date.now();
  if (recentTriggers.has(key) && now - recentTriggers.get(key) < 1000 * 60 * 60) return; // 1 שעה חסימה
  recentTriggers.set(key, now);

  const displayNames = channel.members
    .filter(m => !m.user.bot)
    .map(m => m.displayName)
    .join(', ');

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 5000);

  const player = createAudioPlayer();
  connection.subscribe(player);

  const line = `${getRandomElevenLine()} ${displayNames}, תתארגנו לפני שאני משתעל עליכם!`;
  const buffer = await synthesizeElevenTTS(line);
  const stream = Readable.from(buffer);
  const resource = createAudioResource(stream, {
    inputType: StreamType.Arbitrary
  });

  player.play(resource);
  player.once(AudioPlayerStatus.Idle, () => {
    connection.destroy();
  });

  const textChannel = channel.guild.channels.cache.get(MAIN_TEXT_CHANNEL_ID);
  if (textChannel && textChannel.isTextBased()) {
    const message = await textChannel.send(`👀 **שמעון עלה לבדוק מה הולך עם:** ${displayNames}`);
    message.react('💨');

    setTimeout(async () => {
      const fetched = await textChannel.messages.fetch(message.id);
      const reaction = fetched.reactions.cache.get('💨');
      if (reaction && reaction.count === 1) {
        await fetched.reactions.removeAll();
      }
    }, 1000 * 60 * 5);

    log(`💬 שמעון בירך את ${displayNames} בערוץ ${channel.name} עם המשפט: "${line}"`);
  }
}

module.exports = { handleVoiceJoinGreeter };
