// 📁 handlers/voiceHandler.js
const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const { updateVoiceActivity } = require('./mvpTracker');
const {
    trackVoiceMinutes,
    trackJoinCount,
    trackJoinDuration,
    trackActiveHour
} = require('./statTracker');
const db = require('../utils/firebase');
const podcastManager = require('./podcastManager');
const ttsTester = require('../tts/ttsTester'); // נתיב מתוקן
const { log } = require('../utils/logger');

// הגדרות כלליות
const FIFO_CHANNEL_ID = process.env.FIFO_CHANNEL_ID; // שימוש בשם הנכון מהקוד שלך
const FIFO_ROLE_NAME = 'FIFO';

// מפה לניהול זמני כניסה
const joinTimestamps = new Map();

/**
 * מטפל בעדכוני מצב קולי של משתמשים.
 * זוהי נקודת הכניסה העיקרית לאירועי קול בבוט.
 * @param {import('discord.js').VoiceState} oldState - מצב הקול הישן של המשתמש.
 * @param {import('discord.js').VoiceState} newState - מצב הקול החדש של המשתמש.
 */
async function handleVoiceStateUpdate(oldState, newState) {
    // --- 1. בדיקות הגנה בסיסיות ---
    if (!newState.member || newState.member.user.bot) {
        return; // התעלם מבוטים או מאירועים ללא משתמש
    }

    const member = newState.member;
    const userId = member.id;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const guild = member.guild;
    const now = Date.now();

    // --- 2. בדיקת ערוץ הטסטים של TTS ---
    const joinedTestChannel = newChannel && newChannel.id === ttsTester.TEST_CHANNEL_ID;
    if (joinedTestChannel) {
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            await ttsTester.runTTSTest(member);
            return; 
        }
    }

    // --- 3. המשך לוגיקה רגילה ---

    // התעלם מערוץ AFK
    if (newChannel?.id === guild.afkChannelId || oldChannel?.id === guild.afkChannelId) {
        return;
    }
    
    // --- 4. ניהול תפקיד FIFO ---
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
            console.error(`⚠️ שגיאה בניהול תפקיד FIFO עבור ${member.displayName}:`, err.message);
        }
    }

    // --- 5. מעקב סטטיסטיקות (כניסה ויציאה) ---
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
                await db.collection('memberTracking').doc(userId).set({
                    lastActivity: new Date().toISOString()
                }, { merge: true });
            }
            joinTimestamps.delete(userId);
        }
    }

    // --- 6. הפעלת לוגיקת הפודקאסט/TTS ---
    if (oldChannel?.id !== newChannel?.id) {
        if (newChannel?.id !== ttsTester.TEST_CHANNEL_ID) {
            // --- ✅ התיקון היחיד נמצא כאן ---
            // שימוש בשם הפונקציה הנכון שמיובא מ-podcastManager
            await podcastManager.handleVoiceStateUpdate(oldState, newState);
        }
    }
}

module.exports = {
    handleVoiceStateUpdate
};