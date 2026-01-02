// 📁 handlers/voiceHandler.js
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { updateVoiceActivity } = require('./mvpTracker');
const {
    trackVoiceMinutes,
    trackJoinCount,
    trackJoinDuration,
    trackActiveHour
} = require('./statTracker');
const { getUserRef } = require('../utils/userUtils'); // ✅ השינוי היחיד: חיבור למערכת החדשה
const db = require('../utils/firebase');
const podcastManager = require('./podcastManager');
const ttsTester = require('./ttsTester');
const bf6Announcer = require('./bf6Announcer');
const { log } = require('../utils/logger');

// --- הגדרות כלליות ---
const FIFO_CHANNEL_ID = process.env.FIFO_CHANNEL_ID; 
const TTS_TEST_CHANNEL_ID = '1396779274173943828';
const BF6_VOICE_CHANNEL_ID = '1403121794235240489'; 
const FIFO_ROLE_NAME = 'FIFO';
const joinTimestamps = new Map();

// --- הגדרות מונה הערוצים הקוליים ---
const COUNTER_CATEGORY_ID = '689124379019313214';
const COUNTER_CHANNEL_PREFIX = '🔊 In Voice:';
const COUNTER_DELETE_AFTER_MINUTES = 5;
let voiceCounterTimeout = null;
let debounceTimeout = null;

async function updateVoiceCounterChannel(guild) {
    if (!guild) return;
    
    // ספירת משתמשים (לא בוטים)
    let totalUsers = 0;
    guild.channels.cache.forEach(c => {
        if (c.type === ChannelType.GuildVoice && c.id !== guild.afkChannelId) {
            totalUsers += c.members.filter(m => !m.user.bot).size;
        }
    });

    const category = guild.channels.cache.get(COUNTER_CATEGORY_ID);
    if (!category) return;

    const channelName = `${COUNTER_CHANNEL_PREFIX} ${totalUsers}`;
    const existingChannel = category.children.cache.find(c => c.name.startsWith(COUNTER_CHANNEL_PREFIX));

    try {
        if (existingChannel) {
            if (existingChannel.name !== channelName) {
                await existingChannel.setName(channelName);
                log(`[VoiceCounter] עודכן ל: ${totalUsers}`);
            }
        } else {
            await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: CATEGORY_ID,
                permissionOverwrites: [{
                    id: guild.id,
                    deny: [PermissionFlagsBits.Connect], 
                    allow: [PermissionFlagsBits.ViewChannel]
                }]
            });
            log(`[VoiceCounter] נוצר ערוץ חדש: ${totalUsers}`);
        }
    } catch (err) {
        // התעלמות משגיאות Rate Limit רגילות
    }
}

async function handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member;
    const userId = member.id;
    const guild = member.guild;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const now = Date.now();

    if (member.user.bot) return;

    // --- 1. עדכון מונה המשתמשים (עם Debounce) ---
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => updateVoiceCounterChannel(guild), 5000);

    // --- 2. בדיקת פודקאסט (האם להשתיק התראות אחרות?) ---
    const isPodcastActive = await podcastManager.handleVoiceStateUpdate(oldState, newState);
    if (isPodcastActive) return; 

    // --- 3. TTS Tester (בדיקות סאונד) ---
    if (newChannel?.id === TTS_TEST_CHANNEL_ID && oldChannel?.id !== TTS_TEST_CHANNEL_ID) {
        await ttsTester.runTTSTest(member);
        return; 
    }

    // --- 4. סטטיסטיקות כניסה/יציאה (מעודכן ל-DB החדש) ---
    
    // כניסה לערוץ
    if (!oldChannel && newChannel) {
        joinTimestamps.set(userId, now);
        await trackJoinCount(userId);
        await trackActiveHour(userId);
        
        // ✅ עדכון סטטוס ב-Master Record
        const userRef = await getUserRef(userId, 'discord');
        await userRef.set({ 
            meta: { lastSeen: new Date().toISOString() },
            tracking: { status: 'active' }
        }, { merge: true });
    }

    // יציאה מערוץ או מעבר ערוץ
    if (oldChannel && (!newChannel || oldChannel.id !== newChannel.id)) {
        const joinedAt = joinTimestamps.get(userId);
        if (joinedAt) {
            const durationMs = now - joinedAt;
            // שומרים רק אם היה מעל דקה
            if (durationMs > 60000) {
                const minutes = Math.round(durationMs / 60000);
                
                // עדכון בכל המקומות הנדרשים (StatTracker מטפל ב-Master DB)
                await updateVoiceActivity(userId, minutes); 
                await trackVoiceMinutes(userId, minutes); 
                await trackJoinDuration(userId, minutes);
                
                // ✅ עדכון זמן פעילות אחרון
                const userRef = await getUserRef(userId, 'discord');
                await userRef.set({ 
                    meta: { lastSeen: new Date().toISOString() }
                }, { merge: true });
            }
            joinTimestamps.delete(userId); // מאפסים כדי להתחיל ספירה מחדש אם עבר ערוץ
        }
    }
    
    // אם עבר ערוץ - מתחילים ספירה חדשה מיד
    if (newChannel && oldChannel && newChannel.id !== oldChannel.id) {
        joinTimestamps.set(userId, now);
    }
    
    // --- 5. לוגיקת הניגון המשולבת (BF6) ---
    if (newChannel && oldChannel?.id !== newChannel.id) {
        if (newChannel.id === BF6_VOICE_CHANNEL_ID) {
            log(`[BF6] מזהה כניסה לערוץ BF6. מפעיל Theme...`);
            await bf6Announcer.playBf6Theme(newChannel, member);
        }
    }
}

module.exports = { 
    handleVoiceStateUpdate,
    updateVoiceCounterChannel 
};