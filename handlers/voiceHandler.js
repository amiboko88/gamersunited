// 📁 handlers/voiceHandler.js
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { updateVoiceActivity } = require('./mvpTracker');
const {
    trackVoiceMinutes,
    trackJoinCount,
    trackJoinDuration,
    trackActiveHour
} = require('./statTracker');
const db = require('../utils/firebase');
const podcastManager = require('./podcastManager');
const ttsTester = require('./ttsTester');
const { log } = require('../utils/logger');

// --- הגדרות כלליות ---
// ✅ [תיקון] שונתה הגדרת המשתנה כדי להשתמש במשתנה סביבה ייעודי לערוץ הראשי
// אנא הגדר משתנה סביבה חדש בשם FIFO_CHANNEL_ID עם המזהה של הערוץ הראשי.
const FIFO_CHANNEL_ID = process.env.FIFO_CHANNEL_ID; 
const FIFO_ROLE_NAME = 'FIFO';
const joinTimestamps = new Map();

// --- הגדרות מונה הערוצים הקוליים ---
const COUNTER_CATEGORY_ID = '689124379019313214';
const COUNTER_CHANNEL_PREFIX = '🔊 In Voice:';
const COUNTER_DELETE_AFTER_MINUTES = 5;
let voiceCounterTimeout = null;
let debounceTimeout = null;

async function updateVoiceCounterChannel(guild) {
    if (!guild || !guild.channels) return;
    const totalMembersInVoice = guild.channels.cache
        .filter(c => c.parentId === COUNTER_CATEGORY_ID && c.type === ChannelType.GuildVoice)
        .reduce((acc, channel) => acc + channel.members.filter(m => !m.user.bot).size, 0);

    let counterChannel = guild.channels.cache.find(c => c.name.startsWith(COUNTER_CHANNEL_PREFIX));
    if (totalMembersInVoice > 0 && voiceCounterTimeout) {
        clearTimeout(voiceCounterTimeout);
        voiceCounterTimeout = null;
    }
    if (totalMembersInVoice > 0) {
        const newName = `${COUNTER_CHANNEL_PREFIX} ${totalMembersInVoice}`;
        if (counterChannel) {
            if (counterChannel.name !== newName) await counterChannel.setName(newName).catch(err => log(`⚠️ שגיאה בעדכון שם ערוץ המונה: ${err.message}`));
        } else {
            try {
                await guild.channels.create({
                    name: newName, type: ChannelType.GuildVoice, parent: COUNTER_CATEGORY_ID, position: 0,
                    permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] }]
                });
            } catch (err) { log(`⚠️ שגיאה ביצירת ערוץ המונה: ${err.message}`); }
        }
    } else if (counterChannel && !voiceCounterTimeout) {
        const channelIdToDelete = counterChannel.id;
        log(`[COUNTER] מתחיל טיימר של ${COUNTER_DELETE_AFTER_MINUTES} דקות למחיקה.`);
        voiceCounterTimeout = setTimeout(async () => {
            const channel = await guild.channels.fetch(channelIdToDelete).catch(() => null);
            if (channel) await channel.delete().catch(err => log(`⚠️ שגיאה במחיקת ערוץ המונה: ${err.message}`));
            voiceCounterTimeout = null;
        }, COUNTER_DELETE_AFTER_MINUTES * 60 * 1000);
    }
}

function scheduleVoiceCounterUpdate(guild) {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => { updateVoiceCounterChannel(guild); }, 2000);
}

async function handleVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    scheduleVoiceCounterUpdate(guild);
    if (newState.member?.user.bot) return;

    const member = newState.member, userId = member.id, oldChannel = oldState.channel, newChannel = newState.channel, now = Date.now();
    if (!oldChannel && newChannel && newChannel.id === ttsTester.TEST_CHANNEL_ID) {
        if (member.permissions.has(PermissionFlagsBits.Administrator)) await ttsTester.runTTSTest(member);
        return;
    }
    if (newChannel?.id === guild.afkChannelId || oldChannel?.id === guild.afkChannelId) return;
    
    const fifoRole = guild.roles.cache.find(r => r.name === FIFO_ROLE_NAME);
    if (fifoRole && FIFO_CHANNEL_ID) {
        try {
            const hasRole = member.roles.cache.has(fifoRole.id);
            if (newChannel?.id === FIFO_CHANNEL_ID && !hasRole) await member.roles.add(fifoRole);
            if (oldChannel?.id === FIFO_CHANNEL_ID && newChannel?.id !== FIFO_CHANNEL_ID && hasRole) await member.roles.remove(fifoRole);
        } catch (err) { log(`⚠️ שגיאה בניהול תפקיד FIFO:`, err.message); }
    }

    if (!oldChannel && newChannel) {
        joinTimestamps.set(userId, now);
        await trackJoinCount(userId); await trackActiveHour(userId);
    }
    if (oldChannel && !newChannel) {
        const joinedAt = joinTimestamps.get(userId);
        if (joinedAt) {
            const durationMs = now - joinedAt;
            if (durationMs > 60000) {
                const minutes = Math.round(durationMs / 60000);
                await updateVoiceActivity(userId, minutes, db); await trackVoiceMinutes(userId, minutes); await trackJoinDuration(userId, minutes);
                await db.collection('memberTracking').doc(userId).set({ lastActivity: new Date().toISOString() }, { merge: true });
            }
            joinTimestamps.delete(userId);
        }
    }
    if (oldChannel?.id !== newChannel?.id && newChannel?.id !== ttsTester.TEST_CHANNEL_ID) {
        await podcastManager.handleVoiceStateUpdate(oldState, newState);
    }
}

module.exports = { handleVoiceStateUpdate, updateVoiceCounterChannel };