const fs = require('fs');
const path = require('path');
const { updateVoiceActivity } = require('./mvpTracker');
const {
  trackVoiceMinutes,
  trackJoinCount,
  trackJoinDuration,
  trackActiveHour
} = require('./statTracker');
const { getPodcastAudioEleven } = require('../tts/ttsEngine.elevenlabs');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  entersState
} = require('@discordjs/voice');

const db = require('../utils/firebase');

const CHANNEL_ID = process.env.TTS_TEST_CHANNEL_ID;
const FIFO_ROLE_NAME = 'FIFO';
const EXTRA_CATEGORY_ID = '1138785781322887233';

const joinTimestamps = new Map();
const recentJoiners = new Map();
const lastTriggeredByChannel = new Map();
const lastVoiceActivityByChannel = new Map();

const triggerLevels = [2, 4, 6, 8, 10];
const triggerCooldownMs = 60 * 60 * 1000; // שעה
const minPresenceMs = 5000;
const recentJoinCooldownMs = 30000;
const minSilenceMs = 10000;

let pingBuffer = null;
try {
  const pingPath = path.join(__dirname, '../assets/xbox.mp3');
  if (fs.existsSync(pingPath)) {
    pingBuffer = fs.readFileSync(pingPath);
  }
} catch {}

function channelIdIsMonitored(channelId, guild) {
  const chan = guild.channels.cache.get(channelId);
  return (
    channelId === CHANNEL_ID ||
    (chan?.parentId && chan.parentId === EXTRA_CATEGORY_ID)
  );
}

function arraysAreEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.every((val, i) => val === bSorted[i]);
}

async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const userId = member.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  const guild = member.guild;
  const now = Date.now();

  if (newChannelId === guild.afkChannelId || oldChannelId === guild.afkChannelId) return;

  // 🎖️ תפקיד FIFO
  const fifoRole = guild.roles.cache.find(r => r.name === FIFO_ROLE_NAME);
  if (fifoRole) {
    try {
      if (newChannelId === CHANNEL_ID && !member.roles.cache.has(fifoRole.id)) {
        await member.roles.add(fifoRole);
      }
      if (oldChannelId === CHANNEL_ID && newChannelId !== CHANNEL_ID && member.roles.cache.has(fifoRole.id)) {
        await member.roles.remove(fifoRole);
      }
    } catch (err) {
      console.error('⚠️ FIFO role error:', err.message);
    }
  }

  // ⏱️ הצטרפות
  const joined = !oldChannelId && newChannelId;
  const left = oldChannelId && !newChannelId;

  if (joined) {
    joinTimestamps.set(userId, now);
    recentJoiners.set(userId, now);
    await db.collection('voiceEntries').doc(userId).set({ joinedAt: now });
  }

  if (left) {
    const joinedAt = joinTimestamps.get(userId) || now - 60000;
    const durationMs = now - joinedAt;
    const durationMinutes = Math.max(1, Math.round(durationMs / 1000 / 60));

    if (durationMinutes > 0 && durationMinutes < 600) {
      await updateVoiceActivity(userId, durationMinutes, db);
      await trackVoiceMinutes(userId, durationMinutes);
      await trackJoinCount(userId);
      await trackJoinDuration(userId, durationMinutes);
      await trackActiveHour(userId);
      await db.collection('voiceTime').add({ userId, minutes: durationMinutes, date: new Date() });
      await db.collection('memberTracking').doc(userId).set({
        lastActivity: new Date().toISOString(),
        activityWeight: 2
      }, { merge: true });
    }

    joinTimestamps.delete(userId);
    await db.collection('voiceEntries').doc(userId).delete().catch(() => {});
  }

  // 🎧 ניטור שמעון
  if (newChannelId && channelIdIsMonitored(newChannelId, guild)) {
    const channel = newState.channel;
    if (!channel) return;

    lastVoiceActivityByChannel.set(channel.id, now);

    const members = [...channel.members.values()].filter(m => !m.user.bot && !m.voice.selfMute);
    const count = members.length;
    const userIds = members.map(m => m.id);
    const displayNames = members.map(m => m.displayName);
    const timestamps = Object.fromEntries(userIds.map(id => [id, joinTimestamps.get(id) || now]));

    const activeEnough = userIds.filter(uid => now - (joinTimestamps.get(uid) || 0) >= minPresenceMs);
    if (activeEnough.length < 2) return;

    if (recentJoiners.has(userId) && now - recentJoiners.get(userId) < recentJoinCooldownMs) return;

    const nextLevel = [...triggerLevels].reverse().find(lvl => count >= lvl);
    if (!nextLevel) return;

    const prev = lastTriggeredByChannel.get(channel.id);
    if (
      prev &&
      prev.level === nextLevel &&
      arraysAreEqual(prev.userIds, userIds) &&
      now - prev.timestamp < triggerCooldownMs
    ) return;

    if (now - (lastVoiceActivityByChannel.get(channel.id) || 0) < minSilenceMs) {
      console.log('⏸️ שיחה חיה – שמעון ממתין');
      return;
    }

    lastTriggeredByChannel.set(channel.id, { level: nextLevel, userIds, timestamp: now });

    try {
      const buffer = await getPodcastAudioEleven(displayNames, userIds, timestamps);
      if (!Buffer.isBuffer(buffer) || buffer.length < 1200) {
        console.warn('⚠️ שמעון קיבל Buffer לא תקין – לא משמיעים');
        return;
      }

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false
      });

      const player = createAudioPlayer();

      if (pingBuffer) {
        const pingResource = createAudioResource(pingBuffer);
        player.play(pingResource);
        connection.subscribe(player);
        await entersState(player, AudioPlayerStatus.Playing, 2000);
        await entersState(player, AudioPlayerStatus.Idle, 10000);
      }

      const resource = createAudioResource(buffer);
      player.play(resource);
      connection.subscribe(player);

      player.on(AudioPlayerStatus.Idle, () => connection.destroy());
      player.on('error', err => console.error('🎧 שגיאת שמעון בזמן ניגון:', err.message));

    } catch (err) {
      console.error('🎙️ פודקאסט שמעון נכשל:', err.message);
    }
  }
}

module.exports = {
  handleVoiceStateUpdate
};
