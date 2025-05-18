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
  const nonBotMembers = channel.members.filter(m => !m.user.bot);
  if (nonBotMembers.size < 5) return; // 🔁 רק אם יש 5 ומעלה
  if (channel.id === process.env.TTS_TEST_CHANNEL_ID) return;

  const key = `${channel.guild.id}-${channel.id}`;
  const now = Date.now();
  if (recentTriggers.has(key) && now - recentTriggers.get(key) < 1000 * 60 * 60) return; // שעה חסימה
  recentTriggers.set(key, now);

  const displayNames = nonBotMembers.map(m => m.displayName).join(', ');

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 5000);

  const player = createAudioPlayer();
  connection.subscribe(player);

  const line = `${getRandomElevenLine()} ${displayNames}, תתארגנו לפני שאני משתעל עליכם!`;
  let buffer;
  try {
    buffer = await synthesizeElevenTTS(line); // ← עכשיו זה PlayHT
  } catch (err) {
    log(`❌ כשל בהשמעת ברכה של שמעון בערוץ ${channel.name}`);
    connection.destroy();
    return;
  }

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
    }, 1000 * 60 * 5); // 5 דקות

    log(`💬 שמעון בירך את ${displayNames} בערוץ ${channel.name} עם המשפט: "${line}"`);
  }
}

module.exports = { handleVoiceJoinGreeter };
