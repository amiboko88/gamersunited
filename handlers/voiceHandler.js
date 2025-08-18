// 📁 handlers/voiceHandler.js (שדרוג למערכת חכמה ויעילה)
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
let debounceTimeout = null; // ✅ [שדרוג] משתנה למנגנון ה-Debounce

/**
 * מנהלת את ערוץ המונה בזמן אמת.
 * @param {import('discord.js').Guild} guild 
 */
async function updateVoiceCounterChannel(guild) {
    if (!guild || !guild.channels) return;

    // ✅ [שדרוג] חישוב יעיל ומדויק יותר של המשתמשים
    const totalMembersInVoice = guild.channels.cache
        .filter(c => c.parentId === COUNTER_CATEGORY_ID && c.type === ChannelType.GuildVoice)
        .reduce((acc, channel) => acc + channel.members.filter(m => !m.user.bot).size, 0);

    let counterChannel = guild.channels.cache.find(
        c => c.parentId === COUNTER_CATEGORY_ID && c.name.startsWith(COUNTER_CHANNEL_PREFIX)
    );

    // ניקוי טיימר המחיקה אם יש משתמשים בערוץ
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
            // יצירת ערוץ חדש אם לא קיים
            try {
                counterChannel = await guild.channels.create({
                    name: newName,
                    type: ChannelType.GuildVoice,
                    parent: COUNTER_CATEGORY_ID,
                    position: 0,
                    permissionOverwrites: [
                        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] }
                    ]
                });
            } catch (err) {
                log(`⚠️ שגיאה ביצירת ערוץ המונה: ${err.message}`);
            }
        }
    } else if (counterChannel && !voiceCounterTimeout) {
        // אם אין משתמשים והערוץ קיים, מתחילים טיימר למחיקה
        const channelIdToDelete = counterChannel.id;
        log(`[COUNTER] אין משתמשים בערוצים קוליים. מתחיל טיימר של ${COUNTER_DELETE_AFTER_MINUTES} דקות למחיקה.`);
        
        voiceCounterTimeout = setTimeout(async () => {
            const channelToDeleteRef = await guild.channels.fetch(channelIdToDelete).catch(() => null);
            if (channelToDeleteRef) {
                await channelToDeleteRef.delete().catch(err => log(`⚠️ שגיאה במחיקת ערוץ המונה: ${err.message}`));
                log(`[COUNTER] ערוץ המונה נמחק לאחר חוסר פעילות.`);
            } else {
                log(`[COUNTER] ניסיון מחיקה בוטל. ערוץ המונה לא נמצא.`);
            }
            voiceCounterTimeout = null; // איפוס הטיימר
        }, COUNTER_DELETE_AFTER_MINUTES * 60 * 1000);
    }
}


/**
 * ✅ [שדרוג] פונקציית מעטפת המפעילה את העדכון עם דיליי (Debounce).
 * מונעת קריאות API מרובות וחוסכת משאבים.
 * @param {import('discord.js').Guild} guild 
 */
function scheduleVoiceCounterUpdate(guild) {
    if (debounceTimeout) {
        clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
        updateVoiceCounterChannel(guild);
    }, 2000); // השהייה של 2 שניות לאיסוף כל השינויים
}

/**
 * מטפל בעדכוני מצב קולי של משתמשים.
 */
async function handleVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    // ✅ [שדרוג] קוראים לפונקציית ה-Debounce במקום לעדכון הישיר
    scheduleVoiceCounterUpdate(guild);
    
    if (newState.member?.user.bot) {
        return;
    }

    const member = newState.member;
    const userId = member.id;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const now = Date.now();

    const joinedTestChannel = !oldChannel && newChannel && newChannel.id === ttsTester.TEST_CHANNEL_ID;
    if (joinedTestChannel) {
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            await ttsTester.runTTSTest(member);
        }
        return;
    }

    if (newChannel?.id === guild.afkChannelId || oldChannel?.id === guild.afkChannelId) {
        return; // העדכון כבר נקרא בתחילת הפונקציה
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
}

module.exports = {
    handleVoiceStateUpdate,
    updateVoiceCounterChannel // ✅ [שדרוג] ייצוא הפונקציה לשימוש בסנכרון הראשוני
};