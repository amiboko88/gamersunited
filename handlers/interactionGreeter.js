// 📁 handlers/interactionGreeter.js
const { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { ChannelType, EmbedBuilder } = require('discord.js');
const { createReadStream } = require('fs');
const { log } = require('../utils/logger');

const MAIN_CHANNEL_ID = process.env.MAIN_TEXT_CHANNEL_ID;
const REACT_EMOJI = '💨';
const SOUND_FILE = './sounds/fart.mp3';
const activeEvents = new Map();

async function handleVoiceJoinGreeter(oldState, newState, client) {
  const channel = newState.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  if (channel.members.size < 3) return;
  if (activeEvents.has(channel.id)) return;

  activeEvents.set(channel.id, true);
  log(`🎉 זוהו 3+ משתמשים בערוץ ${channel.name}, שימי יוצא לדרך!`);

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 5_000);
    const player = createAudioPlayer();
    const resource = createAudioResource(createReadStream('./sounds/shimi.mp3'));
    connection.subscribe(player);
    player.play(resource);

    player.once(AudioPlayerStatus.Idle, () => {
      connection.destroy();
    });
  } catch (err) {
    console.warn('⚠️ שימי נכשל להתחבר:', err);
    connection.destroy();
  }

  const mainChannel = client.channels.cache.get(MAIN_CHANNEL_ID);
  if (!mainChannel || !mainChannel.isTextBased()) return;

  const members = [...channel.members.values()].filter(m => !m.user.bot);
  const mentions = members.map(m => `<@${m.id}>`).join(', ');

  const sentMsg = await mainChannel.send({
    content: `🤖 שימי זיהה פעילות חשודה של ${mentions}! מה דעתכם על זה?`,
  });

  await sentMsg.react(REACT_EMOJI);

  const collector = sentMsg.createReactionCollector({
    filter: (r, u) => r.emoji.name === REACT_EMOJI && !u.bot,
    time: 1000 * 60 * 5,
    max: 1
  });

  collector.on('collect', async () => {
    try {
      const fartConn = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false
      });
      await entersState(fartConn, VoiceConnectionStatus.Ready, 5_000);
      const fartPlayer = createAudioPlayer();
      fartConn.subscribe(fartPlayer);
      fartPlayer.play(createAudioResource(createReadStream(SOUND_FILE)));
      fartPlayer.once(AudioPlayerStatus.Idle, () => fartConn.destroy());
    } catch (err) {
      console.error('❌ שגיאה בהשמעת פלוץ:', err);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      sentMsg.reactions.removeAll().catch(() => {});
    }
    activeEvents.delete(channel.id);
  });
}

module.exports = { handleVoiceJoinGreeter };
