// 📁 handlers/voiceHandler.js
const fs = require('fs');
const path = require('path');
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
const FIFO_CHANNEL_ID = process.env.TTS_TEST_CHANNEL_ID; 
const FIFO_ROLE_NAME = 'FIFO';
const joinTimestamps = new Map();

// --- הגדרות מונה הערוצים הקוליים ---
const COUNTER_CATEGORY_ID = '689124379019313214'; // קטגוריית FIFO
const COUNTER_CHANNEL_PREFIX = '🔊 In Voice:';
const COUNTER_DELETE_AFTER_MINUTES = 5;
let voiceCounterTimeout = null;

/**
 * מנהלת את ערוץ המונה בזמן אמת.
 * @param {import('discord.js').Guild} guild 
 */
async function updateVoiceCounterChannel(guild) {
    if (!guild) return;

    const voiceChannels = guild.channels.cache.filter(c =>
        c.parentId === COUNTER_CATEGORY_ID && c.type === ChannelType.GuildVoice
    );
    const totalMembersInVoice = [...voiceChannels.values()]
        .reduce((acc, channel) => acc + channel.members.filter(m => !m.user.bot).size, 0);

    let counterChannel = guild.channels.cache.find(
        c => c.parentId === COUNTER_CATEGORY_ID && c.name.startsWith(COUNTER_CHANNEL_PREFIX)
    );

    if (totalMembersInVoice > 0 && voiceCounterTimeout) {
        clearTimeout(voiceCounterTimeout);
        voiceCounterTimeout = null;
    }

    if (totalMembersInVoice > 0) {
        const newName = `${COUNTER_CHANNEL_PREFIX} ${totalMembersInVoice}`;
        if (counterChannel) {
            if (counterChannel.name !== newName) {
                await counterChannel.setName(newName).catch(err => log(`⚠️ שגיאה בעדכון שם ערוץ המונה: ${err.message}`));
            }
        } else {
            await guild.channels.create({
                name: newName,
                type: ChannelType.GuildVoice,
                parent: COUNTER_CATEGORY_ID,
                position: 0,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] }
                ]
            }).catch(err => log(`⚠️ שגיאה ביצירת ערוץ המונה: ${err.message}`));
        }
    } else if (counterChannel) {
        const channelIdToDelete = counterChannel.id; // שמירת ה-ID של הערוץ
        log(`[COUNTER] אין משתמשים בערוצים קוליים. מתחיל טיימר של ${COUNTER_DELETE_AFTER_MINUTES} דקות למחיקת ערוץ המונה.`);
        
        voiceCounterTimeout = setTimeout(async () => {
            // ✅ [תיקון] מאחזרים את הערוץ מחדש לפני המחיקה כדי למנוע שגיאת "Unknown Channel"
            const channelToDeleteRef = await guild.channels.fetch(channelIdToDelete).catch(() => null);
            if (channelToDeleteRef) {
                await channelToDeleteRef.delete().catch(err => log(`⚠️ שגיאה במחיקת ערוץ המונה: ${err.message}`));
                log(`[COUNTER] ערוץ המונה נמחק לאחר חוסר פעילות.`);
            } else {
                log(`[COUNTER] ניסיון מחיקה בוטל. ערוץ המונה לא נמצא.`);
            }
        }, COUNTER_DELETE_AFTER_MINUTES * 60 * 1000);
    }
}


/**
 * מטפל בעדכוני מצב קולי של משתמשים.
 */
async function handleVoiceStateUpdate(oldState, newState) {
    if (!newState.member || newState.member.user.bot) {
        // ✅ [תיקון] קוראים למונה גם ביציאת הבוט כדי לעדכן את הספירה ל-0
        if (oldState.member?.user.bot) return;
        await updateVoiceCounterChannel(oldState.guild);
        return;
    }

    const member = newState.member;
    const userId = member.id;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const guild = member.guild;
    const now = Date.now();

    const joinedTestChannel = !oldChannel && newChannel && newChannel.id === ttsTester.TEST_CHANNEL_ID;
    if (joinedTestChannel) {
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            await ttsTester.runTTSTest(member);
        }
        return;
    }

    if (newChannel?.id === guild.afkChannelId || oldChannel?.id === guild.afkChannelId) {
        await updateVoiceCounterChannel(guild); // עדכון גם בכניסה/יציאה מ-AFK
        return;
    }
    
    const fifoRole = guild.roles.cache.find(r => r.name === FIFO_ROLE_NAME);
    if (fifoRole && FIFO_CHANNEL_ID) {
        try {
            const hasRole = member.roles.cache.has(fifoRole.id);
            if (newChannel?.id === FIFO_CHANNEL_ID && !hasRole) {
                await member.roles.add(fifoRole);
                log(`[ROLE] תפקיד FIFO הוסף ל-${member.displayName}`);
            }
            if (oldChannel?.id === FIFO_CHANNEL_ID && newChannel?.id !== FIFO_CHANNEL_ID && hasRole) {
                await member.roles.remove(fifoRole);
                log(`[ROLE] תפקיד FIFO הוסר מ-${member.displayName}`);
            }
        } catch (err) {
            log(`⚠️ שגיאה בניהול תפקיד FIFO עבור ${member.displayName}:`, err.message);
        }
    }

    const joined = !oldChannel && newChannel;
    const left = oldChannel && !newChannel;

    if (joined) {
        joinTimestamps.set(userId, now);
        await trackJoinCount(userId);
        await trackActiveHour(userId);
    }

    if (left) {
        const joinedAt = joinTimestamps.get(userId);
        if (joinedAt) {
            const durationMs = now - joinedAt;
            if (durationMs > 60000 && durationMs < 36000000) {
                const durationMinutes = Math.round(durationMs / 60000);
                log(`[STATS] משתמש ${member.displayName} צבר ${durationMinutes} דקות שיחה.`);
                await updateVoiceActivity(userId, durationMinutes, db);
                await trackVoiceMinutes(userId, durationMinutes);
                await trackJoinDuration(userId, durationMinutes);
                await db.collection('memberTracking').doc(userId).set({ lastActivity: new Date().toISOString() }, { merge: true });
            }
            joinTimestamps.delete(userId);
        }
    }

    if (oldChannel?.id !== newChannel?.id) {
        if (newChannel?.id !== ttsTester.TEST_CHANNEL_ID) {
            await podcastManager.handleVoiceStateUpdate(oldState, newState);
        }
    }
    
    await updateVoiceCounterChannel(guild);
}

module.exports = {
    handleVoiceStateUpdate
};