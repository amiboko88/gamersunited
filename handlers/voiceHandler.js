// 📁 handlers/voiceHandler.js
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const {
    trackVoiceMinutes,
    trackJoinCount,
    trackJoinDuration,
    trackActiveHour,
    updateGameStats 
} = require('./statTracker');
const { getUserRef } = require('../utils/userUtils'); 
const podcastManager = require('./podcastManager');
const ttsTester = require('./ttsTester');
const bf6Announcer = require('./bf6Announcer');

// --- הגדרות כלליות ---
const FIFO_CHANNEL_ID = process.env.FIFO_CHANNEL_ID; 
const TTS_TEST_CHANNEL_ID = '1396779274173943828';
const BF6_VOICE_CHANNEL_ID = '1403121794235240489'; 
const FIFO_ROLE_NAME = 'FIFO';
const joinTimestamps = new Map();

// --- הגדרות מונה הערוצים הקוליים ---
const COUNTER_CATEGORY_ID = '689124379019313214';
const COUNTER_CHANNEL_PREFIX = '🔊 In Voice:';
let voiceCounterChannelId = null; 

async function handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const userId = member.id;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const now = Date.now();

    // 1. טיפול במונה משתמשים (Voice Counter)
    await updateVoiceCounterChannel(newState.client);

    // 2. טיפול ב-FIFO
    if (FIFO_CHANNEL_ID) {
        const fifoRole = newState.guild.roles.cache.find(r => r.name === FIFO_ROLE_NAME);
        if (fifoRole) {
            if (newChannel?.id === FIFO_CHANNEL_ID) {
                if (!member.roles.cache.has(fifoRole.id)) {
                    await member.roles.add(fifoRole).catch(console.error);
                }
            } else if (oldChannel?.id === FIFO_CHANNEL_ID && newChannel?.id !== FIFO_CHANNEL_ID) {
                if (member.roles.cache.has(fifoRole.id)) {
                    await member.roles.remove(fifoRole).catch(console.error);
                }
            }
        }
    }

    // 3. TTS Tester
    if (newChannel?.id === TTS_TEST_CHANNEL_ID && oldChannel?.id !== TTS_TEST_CHANNEL_ID) {
        await ttsTester.runTTSTest(member);
    }

    // 4. חישוב זמן שהייה (XP וסטטיסטיקה)
    if (!newChannel && oldChannel) { // יציאה
        const joinedAt = joinTimestamps.get(userId);
        if (joinedAt) {
            const durationMs = now - joinedAt;
            if (durationMs > 60000) {
                const minutes = Math.round(durationMs / 60000);
                
                await trackVoiceMinutes(userId, minutes); 
                await trackJoinDuration(userId, minutes);
                
                const activity = member.presence?.activities?.find(a => a.type === 0);
                if (activity) {
                    await updateGameStats(userId, activity.name, minutes);
                }

                const userRef = await getUserRef(userId, 'discord');
                await userRef.set({ 
                    meta: { lastSeen: new Date().toISOString() }
                }, { merge: true });
            }
            joinTimestamps.delete(userId);
        }
    }
    
    // כניסה או מעבר ערוץ
    if (newChannel && (!oldChannel || newChannel.id !== oldChannel.id)) {
        joinTimestamps.set(userId, now);
        if (!oldChannel) {
            await trackJoinCount(userId);
            await trackActiveHour(userId);
        }
    }
    
    // 5. BF6 Announcer
    if (newChannel && oldChannel?.id !== newChannel.id) {
        if (newChannel.id === BF6_VOICE_CHANNEL_ID) {
            await bf6Announcer.playBf6Theme(newChannel, member);
        }
    }

    // 6. Podcast Manager
    await podcastManager.handleVoiceStateUpdate(oldState, newState);
}

// ניהול ערוץ מונה המחוברים
async function updateVoiceCounterChannel(client) {
    try {
        // ✅ הגנה מפני קריסה: בדיקה אם ה-Client וה-Guilds מוכנים
        if (!client || !client.guilds || !client.guilds.cache) {
            // console.warn('[VoiceCounter] Client not ready yet, skipping update.');
            return;
        }

        const guild = client.guilds.cache.first(); 
        if (!guild) return;

        let totalVoiceUsers = 0;
        guild.channels.cache.forEach(channel => {
            if (channel.type === ChannelType.GuildVoice) {
                totalVoiceUsers += channel.members.filter(m => !m.user.bot).size;
            }
        });

        const channelName = `${COUNTER_CHANNEL_PREFIX} ${totalVoiceUsers}`;

        // אם הערוץ כבר קיים וידוע לנו
        if (voiceCounterChannelId) {
            const channel = guild.channels.cache.get(voiceCounterChannelId);
            if (channel) {
                if (channel.name !== channelName) {
                    await channel.setName(channelName).catch(console.error);
                }
                return; 
            }
        }

        // חיפוש ערוץ קיים אם המשתנה התאפס
        const existingChannel = guild.channels.cache.find(c => 
            c.name.startsWith(COUNTER_CHANNEL_PREFIX) && c.parentId === COUNTER_CATEGORY_ID
        );

        if (existingChannel) {
            voiceCounterChannelId = existingChannel.id;
            if (existingChannel.name !== channelName) {
                await existingChannel.setName(channelName);
            }
        } else {
            const newChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: COUNTER_CATEGORY_ID,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.Connect] }
                ]
            });
            voiceCounterChannelId = newChannel.id;
        }
    } catch (err) {
        console.error('Error updating voice counter:', err);
    }
}

module.exports = { handleVoiceStateUpdate, updateVoiceCounterChannel };