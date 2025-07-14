// 📁 handlers/podcastManager.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState } = require('@discordjs/voice');
const { getPodcastAudioEleven } = require('../tts/ttsEngine.elevenlabs');
const { log } = require('../utils/logger');
const { Collection } = require('discord.js'); // לייבוא Collection
const { loadBotState, saveBotState } = require('../utils/botStateManager');

// --- דגלי מצב גלובליים לפודקאסט ---
let isPodcastActive = false;
let activePodcastChannelId = null;
let podcastMonitoringEnabled = false; 

// מפתח למצב הפודקאסט ב-Firestore
const PODCAST_STATE_KEY = 'podcastStatus';

// 🔇 הגדרת רשימת פקודות שיושבתו בזמן פודקאסט
const restrictedCommands = ['leave', 'stop', 'mute', 'kick', 'play', 'soundboard', 'forceleave', 'forcestop'];

/**
 * טוען את מצב הפודקאסט מ-Firestore בעת עליית הבוט, ומתאים לשעות הפעילות.
 */
async function initializePodcastState() {
    console.log('[PODCAST_STATE] מאתחל מצב פודקאסט...');
    const savedState = await loadBotState(PODCAST_STATE_KEY);
    
    const options = { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: 'Asia/Jerusalem' };
    const jerusalemTime = new Date().toLocaleString('en-US', options);
    const [jerusalemHour, jerusalemMinute] = jerusalemTime.split(':').map(Number);
    const isCurrentlyActiveHours = (jerusalemHour >= 18 || jerusalemHour < 6); // 18:00 עד 05:59

    if (savedState) {
        console.log(`[PODCAST_STATE] מצב שמור נמצא: monitoringEnabled=${savedState.podcastMonitoringEnabled}, isCurrentlyActiveHours=${isCurrentlyActiveHours}`);
        if (savedState.podcastMonitoringEnabled || isCurrentlyActiveHours) {
            podcastMonitoringEnabled = true;
            console.log('[PODCAST_STATE] ניטור הופעל על בסיס מצב שמור או שעות פעילות נוכחיות.');
        } else {
            podcastMonitoringEnabled = false;
            console.log('[PODCAST_STATE] ניטור כבוי על בסיס מצב שמור או שעות פעילות נוכחיות.');
        }
    } else {
        console.log(`[PODCAST_STATE] לא נמצא מצב שמור. קובע לפי שעות פעילות נוכחיות: ${isCurrentlyActiveHours}`);
        podcastMonitoringEnabled = isCurrentlyActiveHours;
    }

    await saveBotState(PODCAST_STATE_KEY, { podcastMonitoringEnabled: podcastMonitoringEnabled });
    console.log(`[PODCAST_STATE] מצב פודקאסט סופי לאחר אתחול: monitoringEnabled=${podcastMonitoringEnabled}`);
}

/**
 * מפעיל/מכבה את ניטור ערוצי הקול לפודקאסט. נקרא ממשימות Cron.
 * @param {boolean} enable - האם לאפשר ניטור.
 */
async function setPodcastMonitoring(enable) { 
    podcastMonitoringEnabled = enable;
    await saveBotState(PODCAST_STATE_KEY, { podcastMonitoringEnabled: enable }); 
    if (enable) {
        log('🎙️ ניטור פודקאסטים הופעל.');
    } else {
        log('🎙️ ניטור פודקאסטים כובה.');
        if (isPodcastActive && activePodcastChannelId && global.client) {
            // ✅ וודא שקולקציות voiceConnections ו-audioPlayers קיימות לפני גישה
            if (global.client.voiceConnections instanceof Collection && global.client.audioPlayers instanceof Collection) {
                const connection = global.client.voiceConnections.get(activePodcastChannelId);
                if (connection) {
                    connection.destroy();
                    global.client.voiceConnections.delete(activePodcastChannelId);
                    global.client.audioPlayers.delete(activePodcastChannelId);
                }
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
    // ✅ וודא ש-global.client ו-global.client.voiceConnections קיימים ומהסוג הנכון
    const connectionExists = global.client && 
                           global.client.voiceConnections instanceof Collection && 
                           global.client.voiceConnections.has(activePodcastChannelId);
    
    log(`[DEBUG] isBotPodcasting check: isPodcastActive=${isPodcastActive}, connectionExists=${connectionExists}, activePodcastChannelId=${activePodcastChannelId}, requestedChannelId=${channelId}`);
    
    return isPodcastActive && connectionExists && (channelId === null || activePodcastChannelId === channelId);
}

/**
 * מטפל בלוגיקת הפעלת הפודקאסט כאשר התנאים מתקיימים.
 * @param {import('discord.js').VoiceState} newState - מצב הקול החדש.
 * @param {import('discord.js').Client} client - אובייקט הקליינט.
 */
async function handlePodcastTrigger(newState, client) {
    log(`[DEBUG] handlePodcastTrigger triggered for user: ${newState.member.user.tag} (${newState.member.user.id}), channel: ${newState.channel?.name || 'none'}, oldChannel: ${newState.oldState?.channel?.name || 'none'}`);

    if (!podcastMonitoringEnabled) {
        log('[DEBUG] Podcast monitoring is NOT enabled. Returning.');
        return;
    }
    if (newState.member.user.bot) {
        log('[DEBUG] Triggered by a BOT. Returning.');
        return;
    }
    
    const newChannel = newState.channel;
    const oldChannel = newState.oldState?.channel;

    // טיפול בניתוק פודקאסט אם משתתפים ירדו
    if (oldChannel && !newChannel && isBotPodcasting(oldChannel.guild.id, oldChannel.id)) {
        log(`[DEBUG] User left podcast channel: ${oldChannel.name}. Checking remaining members.`);
        const humanMembers = oldChannel.members.filter(m => !m.user.bot).size;
        if (humanMembers < 2) { 
            log(`🎙️ פודקאסט הופסק בערוץ ${oldChannel.name} עקב מיעוט משתתפים (${humanMembers} נותרו).`);
            await stopPodcast(oldChannel.id);
            return;
        }
        log(`[DEBUG] Podcast active, but enough members remain (${humanMembers}).`);
    }

    // טיפול בהצטרפות לערוץ וטריגר פודקאסט
    if (newChannel && !oldChannel) { // משתמש הצטרף לערוץ
        log(`[DEBUG] User joined channel: ${newChannel.name}.`);

        // אם הבוט כבר בפודקאסט, אל תתחיל חדש (אלא אם זה בדיוק אותו ערוץ)
        if (isBotPodcasting(newChannel.guild.id) && activePodcastChannelId !== newChannel.id) {
            log('[DEBUG] Bot is already podcasting in ANOTHER channel. Skipping new podcast.');
            return; 
        }
        // אם הבוט כבר בפודקאסט באותו ערוץ, אין צורך להתחיל שוב
        if (isBotPodcasting(newChannel.guild.id, newChannel.id)) { 
            log('[DEBUG] Bot is already podcasting in THIS channel. Skipping new podcast.');
            return; 
        }

        const humanMembers = newChannel.members.filter(m => !m.user.bot);
        const memberCount = humanMembers.size;
        log(`[DEBUG] Human member count in ${newChannel.name}: ${memberCount}`);

        // 🎯 זיהוי מספר המשתתפים הרצוי
        const triggerLevels = [2, 4, 6, 8, 10]; // הגדרת רמות הטריגר כאן
        if (triggerLevels.includes(memberCount)) {
            log(`⏳ זוהו ${memberCount} משתתפים בערוץ ${newChannel.name}. ממתין לשקט לפני הפודקאסט...`);
            
            // 🔇 המתנה לשקט (פשוטה) - ניתן לשפר עם VAD
            await new Promise(resolve => setTimeout(resolve, 7000)); // המתן 7 שניות
            log('[DEBUG] Finished 7-second wait. Re-checking conditions...');

            // בדוק שוב את מספר המשתתפים ואת מצב הבוט לאחר ההמתנה
            const currentHumanMembers = newChannel.members.filter(m => !m.user.bot).size;
            log(`[DEBUG] Current human member count AFTER WAIT: ${currentHumanMembers}.`);

            if (!triggerLevels.includes(currentHumanMembers)) {
                log('❌ Condition changed: Member count is no longer a trigger level. Cancelling podcast.');
                return;
            }
            if (isBotPodcasting(newChannel.guild.id, newChannel.id)) { 
                log('❌ Condition changed: Bot started podcast in this channel during wait. Cancelling this trigger.');
                return;
            }
            if (isBotPodcasting(newChannel.guild.id) && activePodcastChannelId !== newChannel.id) {
                log('❌ Condition changed: Bot started podcast in ANOTHER channel during wait. Cancelling this trigger.');
                return;
            }

            try {
                log(`🎙️ מפעיל פודקאסט בערוץ: ${newChannel.name} עם ${currentHumanMembers} משתתפים.`);
                isPodcastActive = true;
                activePodcastChannelId = newChannel.id;

                // ✅ וודא ש-client.voiceConnections ו-client.audioPlayers קיימים לפני גישה
                if (!(client.voiceConnections instanceof Collection) || !(client.audioPlayers instanceof Collection)) {
                    console.error('🛑 ERROR: client.voiceConnections or client.audioPlayers are not initialized as Collections!');
                    throw new Error('Voice collections not ready. Cannot start podcast.');
                }

                const connection = joinVoiceChannel({
                    channelId: newChannel.id,
                    guildId: newChannel.guild.id,
                    adapterCreator: newChannel.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false,
                });
                const player = createAudioPlayer();
                connection.subscribe(player);

                client.voiceConnections.set(newChannel.id, connection); // שורה 186 אם זו הקריסה
                client.audioPlayers.set(newChannel.id, player); 

                const participantNames = humanMembers.map(m => m.displayName);
                const participantIds = humanMembers.map(m => m.id);
                const joinTimestamps = {};
                humanMembers.forEach(m => {
                    if (m.voice.channel) { 
                        joinTimestamps[m.id] = m.voice.channel.joinTimestamp;
                    }
                });

                log('[DEBUG] Calling getPodcastAudioEleven to generate audio...');
                const audioBuffer = await getPodcastAudioEleven(participantNames, participantIds, joinTimestamps);
                log('[DEBUG] Audio buffer generated. Playing...');
                const resource = createAudioResource(audioBuffer);

                player.play(resource);

                // המתן לסיום הפודקאסט או לזמן מקסימלי
                log('[DEBUG] Waiting for podcast to finish (max 5 minutes)...');
                await entersState(player, AudioPlayerStatus.Idle, 60_000 * 5); // מקסימום 5 דקות
                log('🎙️ פודקאסט הסתיים בהצלחה.');

            } catch (error) {
                console.error('🛑 שגיאה בהפעלת פודקאסט:', error);
                log(`❌ שגיאה בהפעלת פודקאסט בערוץ ${newChannel.name}: ${error.message}`);
            } finally {
                log('[DEBUG] Podcast finished or encountered error. Stopping and resetting state.');
                await stopPodcast(newChannel.id); 
            }
        } else {
            log(`[DEBUG] Member count (${memberCount}) is not a trigger level. Skipping podcast trigger.`);
        }
    } else {
        log('[DEBUG] Not a user joining event. Skipping podcast trigger.');
    }
}

/**
 * מנתק את הבוט מהערוץ ומאפס את מצב הפודקאסט.
 * @param {string} channelId - ה-ID של הערוץ לניתוק.
 */
async function stopPodcast(channelId) { 
    log(`[DEBUG] Attempting to stop podcast for channel ID: ${channelId}`);
    if (global.client) {
        // ✅ וודא שקולקציות voiceConnections ו-audioPlayers קיימות לפני גישה
        if (global.client.voiceConnections instanceof Collection && global.client.audioPlayers instanceof Collection) {
            const connection = global.client.voiceConnections.get(channelId); // שורה 232 אם זו הקריסה
            if (connection) {
                log('[DEBUG] Destroying voice connection.');
                connection.destroy();
                global.client.voiceConnections.delete(channelId);
                global.client.audioPlayers.delete(channelId);
            } else {
                log('[DEBUG] No active voice connection found for this channel ID.');
            }
        } else {
            log('[DEBUG] global.client.voiceConnections or global.client.audioPlayers are not Collections. Cannot stop podcast cleanly.');
        }
    } else {
        log('[DEBUG] global.client is not available.');
    }
    
    if (activePodcastChannelId === channelId) {
        log('[DEBUG] Resetting podcast active state.');
        isPodcastActive = false;
        activePodcastChannelId = null;
    }
    await saveBotState(PODCAST_STATE_KEY, { podcastMonitoringEnabled: podcastMonitoringEnabled }); 
}


module.exports = {
    initializePodcastState, 
    setPodcastMonitoring,
    handlePodcastTrigger,
    isBotPodcasting,
    restrictedCommands 
};