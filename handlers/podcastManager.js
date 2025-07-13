// 📁 handlers/podcastManager.js - מודול חדש לניהול לוגיקת הפודקאסט המרכזית
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState } = require('@discordjs/voice');
const { getPodcastAudioEleven } = require('../tts/ttsEngine.elevenlabs');
const { log } = require('../utils/logger'); // וודא ש-logger.js קיים ב-utils
const { Collection } = require('discord.js'); // לייבוא Collection אם לא גלובלי

// --- דגלי מצב גלובליים לפודקאסט (ייתכן שיהיו על ה-client עצמו, אבל כאן לארגון) ---
let isPodcastActive = false;
let activePodcastChannelId = null;
let podcastMonitoringEnabled = false; // נשלט על ידי ה-cron jobs

// --- קולקציות לניהול חיבורים ונגנים ---
// נשתמש בקולקציות ספציפיות למודול זה או באלו שעל ה-client
// בהנחה שה-client.voiceConnections ו-client.audioPlayers קיימים ומנוהלים ב-index.js
// אם לא, נגדיר כאן:
// const voiceConnections = new Collection();
// const audioPlayers = new Collection();

// 🔇 הגדרת רשימת פקודות שיושבתו בזמן פודקאסט
const restrictedCommands = ['leave', 'stop', 'mute', 'kick', 'play', 'soundboard', 'forceleave', 'forcestop']; // דוגמאות

/**
 * מפעיל/מכבה את ניטור ערוצי הקול לפודקאסט. נקרא ממשימות Cron.
 * @param {boolean} enable - האם לאפשר ניטור.
 */
function setPodcastMonitoring(enable) {
    podcastMonitoringEnabled = enable;
    if (enable) {
        log('🎙️ ניטור פודקאסטים הופעל.');
    } else {
        log('🎙️ ניטור פודקאסטים כובה.');
        // אם מכבים את הניטור, נתק כל פודקאסט פעיל
        if (isPodcastActive && activePodcastChannelId && global.client) {
            const connection = global.client.voiceConnections.get(activePodcastChannelId);
            if (connection) {
                connection.destroy();
                global.client.voiceConnections.delete(activePodcastChannelId);
                global.client.audioPlayers.delete(activePodcastChannelId);
            }
            isPodcastActive = false;
            activePodcastChannelId = null;
            log('🎙️ פודקאסט הופסק עקב כיבוי ניטור (סיום שעות פעילות).');
        }
    }
}

/**
 * בודק אם הבוט במצב פודקאסט פעיל בערוץ נתון.
 * משמש ללוגיקת ה"נעילה".
 * @param {string} guildId - ה-ID של השרת.
 * @param {string} [channelId=null] - ה-ID של הערוץ. אם null, יבדוק האם יש פודקאסט פעיל בכלל.
 * @returns {boolean}
 */
function isBotPodcasting(guildId, channelId = null) {
    // בודק גם שהקונקשן קיים ופעיל
    const connectionExists = global.client?.voiceConnections.has(activePodcastChannelId);
    return isPodcastActive && connectionExists && (channelId === null || activePodcastChannelId === channelId);
}

/**
 * מטפל בלוגיקת הפעלת הפודקאסט כאשר התנאים מתקיימים.
 * @param {import('discord.js').VoiceState} newState - מצב הקול החדש.
 * @param {import('discord.js').Client} client - אובייקט הקליינט.
 */
async function handlePodcastTrigger(newState, client) {
    if (!podcastMonitoringEnabled || newState.member.user.bot) return; // אם ניטור לא פעיל או זה בוט
    
    const newChannel = newState.channel;
    const oldChannel = newState.oldState?.channel; // וודא שזה קיים

    // טיפול בניתוק פודקאסט אם משתתפים ירדו
    if (oldChannel && !newChannel && isBotPodcasting(oldChannel.guild.id, oldChannel.id)) {
        const humanMembers = oldChannel.members.filter(m => !m.user.bot).size;
        if (humanMembers < 2) { // פחות מ-2 משתתפים אנושיים
            log(`🎙️ פודקאסט הופסק בערוץ ${oldChannel.name} עקב מיעוט משתתפים (${humanMembers} נותרו).`);
            stopPodcast(oldChannel.id);
            return;
        }
    }

    // טיפול בהצטרפות לערוץ וטריגר פודקאסט
    if (newChannel && !oldChannel) { // משתמש הצטרף לערוץ
        // אם הבוט כבר בפודקאסט, אל תתחיל חדש (אלא אם זה בדיוק אותו ערוץ)
        if (isBotPodcasting(newChannel.guild.id) && activePodcastChannelId !== newChannel.id) {
            log('❌ הבוט כבר בפודקאסט פעיל בערוץ אחר. מבטל פודקאסט חדש.');
            return; 
        }
        if (isBotPodcasting(newChannel.guild.id, newChannel.id)) { // כבר בפודקאסט בערוץ זה
            return; 
        }

        const humanMembers = newChannel.members.filter(m => !m.user.bot);
        const memberCount = humanMembers.size;

        // 🎯 זיהוי מספר המשתתפים הרצוי
        if ([2, 4, 6, 8, 10].includes(memberCount)) {
            log(`⏳ זוהו ${memberCount} משתתפים בערוץ ${newChannel.name}. ממתין לשקט לפני הפודקאסט...`);
            
            // 🔇 המתנה לשקט (פשוטה) - ניתן לשפר עם VAD
            await new Promise(resolve => setTimeout(resolve, 7000)); // המתן 7 שניות

            // בדוק שוב את מספר המשתתפים ואת מצב הבוט לאחר ההמתנה
            const currentHumanMembers = newChannel.members.filter(m => !m.user.bot).size;
            if (![2, 4, 6, 8, 10].includes(currentHumanMembers) || isBotPodcasting(newChannel.guild.id)) {
                log('❌ תנאי הפודקאסט לא מתקיימים עוד (שינוי משתתפים/בוט כבר פעיל). מבטל.');
                return;
            }

            try {
                log(`🎙️ מפעיל פודקאסט בערוץ: ${newChannel.name} עם ${currentHumanMembers} משתתפים.`);
                isPodcastActive = true;
                activePodcastChannelId = newChannel.id;

                const connection = joinVoiceChannel({
                    channelId: newChannel.id,
                    guildId: newChannel.guild.id,
                    adapterCreator: newChannel.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false,
                });
                const player = createAudioPlayer();
                connection.subscribe(player);

                client.voiceConnections.set(newChannel.id, connection);
                client.audioPlayers.set(newChannel.id, player);

                const participantNames = humanMembers.map(m => m.displayName);
                const participantIds = humanMembers.map(m => m.id);
                const joinTimestamps = {};
                humanMembers.forEach(m => {
                    if (m.voice.channel) {
                        joinTimestamps[m.id] = m.voice.channel.joinTimestamp;
                    }
                });

                const audioBuffer = await getPodcastAudioEleven(participantNames, participantIds, joinTimestamps);
                const resource = createAudioResource(audioBuffer);

                player.play(resource);

                // המתן לסיום הפודקאסט או לזמן מקסימלי
                await entersState(player, AudioPlayerStatus.Idle, 60_000 * 5); // מקסימום 5 דקות
                log('🎙️ פודקאסט הסתיים בהצלחה.');

            } catch (error) {
                console.error('🛑 שגיאה בהפעלת פודקאסט:', error);
                log(`❌ שגיאה בהפעלת פודקאסט בערוץ ${newChannel.name}: ${error.message}`);
            } finally {
                // ניתוק ואיפוס מצב הבוט לאחר הפודקאסט
                stopPodcast(newChannel.id);
            }
        }
    }
}

/**
 * מנתק את הבוט מהערוץ ומאפס את מצב הפודקאסט.
 * @param {string} channelId - ה-ID של הערוץ לניתוק.
 */
function stopPodcast(channelId) {
    if (global.client) {
        const connection = global.client.voiceConnections.get(channelId);
        if (connection) {
            connection.destroy();
            global.client.voiceConnections.delete(channelId);
            global.client.audioPlayers.delete(channelId);
        }
    }
    if (activePodcastChannelId === channelId) {
        isPodcastActive = false;
        activePodcastChannelId = null;
    }
}


module.exports = {
    setPodcastMonitoring,
    handlePodcastTrigger,
    isBotPodcasting,
    restrictedCommands // ייצוא רשימת הפקודות המוגבלות לשימוש ב-index.js
};