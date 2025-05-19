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
const recentTriggers = new Map();

async function handleVoiceJoinGreeter(oldState, newState, client) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const channel = newState.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    log(`📛 לא ערוץ קול חוקי – בוט לא יפעל`);
    return;
  }

  const key = `${channel.guild.id}-${channel.id}`;
  const now = Date.now();
  if (recentTriggers.has(key) && now - recentTriggers.get(key) < 1000 * 60 * 60) {
    log(`🕒 שמעון כבר הופעל בערוץ ${channel.name} בשעה האחרונה – מדלג`);
    return;
  }

  // 🕐 השהיה לבדיקת התייצבות (גל של כניסות)
  setTimeout(async () => {
    const updatedChannel = newState.guild.channels.cache.get(channel.id);
    const updatedNonBots = updatedChannel.members.filter(m => !m.user.bot);

    if (updatedNonBots.size < 4) {
      log(`⛔ פחות מ־4 שחקנים גם אחרי דיליי – שמעון לא יופעל (בערוץ ${channel.name})`);
      return;
    }

    recentTriggers.set(key, Date.now());
    const displayNames = updatedNonBots.map(m => m.displayName).join(', ');
    const line = `${getRandomElevenLine()} ${displayNames}, תתארגנו לפני שאני משתעל עליכם!`;
    const textLength = line.length;

    let connection;
    try {
      connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 5000);
      log(`🔊 שמעון הצטרף לערוץ ${channel.name}`);
    } catch (err) {
      log(`❌ נכשל בהצטרפות לערוץ ${channel.name}: ${err.message}`);
      return;
    }

    const player = createAudioPlayer();
    connection.subscribe(player);

    let buffer;
    try {
      buffer = await synthesizeElevenTTS(line);
      log(`📤 TTS הוכן בהצלחה: ${textLength} תווים | שחקנים: ${displayNames}`);
    } catch (err) {
      log(`❌ כשל בהשמעת ברכה של שמעון בערוץ ${channel.name}: ${err.message}`);
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
      log(`📴 שמעון התנתק מערוץ ${channel.name}`);
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
  }, 1500); // ← דיליי של 1.5 שניות
}

module.exports = { handleVoiceJoinGreeter };
