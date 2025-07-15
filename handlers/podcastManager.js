// 📁 handlers/podcastManager.js - מודול לניהול לוגיקת הפודקאסט המרכזית
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState } = require('@discordjs/voice');
const { synthesizeElevenTTS } = require('../tts/ttsEngine.elevenlabs');
const { log } = require('../utils/logger');
const { Collection } = require('discord.js');
const { loadBotState, saveBotState } = require('../utils/botStateManager');
// ✅ ייבוא getScriptByUserId ו-getLineForUser
const { getScriptByUserId, getLineForUser } = require('../data/fifoLines'); 
// ✅ ייבוא dayjs עם פלאגינים לטיפול באזור זמן
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

// --- דגלי מצב גלובליים לפודקאסט ---
let isPodcastActive = false; // האם פודקאסט (צליה) פעיל כרגע
let activePodcastChannelId = null; // הערוץ בו מתבצעת הצליה
let podcastMonitoringEnabled = false; // נשלט על ידי ה-cron jobs

// מפתח למצב הפודקאסט ב-Firestore
const PODCAST_STATE_KEY = 'podcastStatus';

// 🔇 הגדרת רשימת פקודות שיושבתו בזמן פודקאסט קצר (אם נדרש)
const restrictedCommands = ['leave', 'stop', 'mute', 'kick', 'play', 'soundboard', 'forceleave', 'forcestop'];

// --- הגדרות חדשות לטריגר "צליה" ---
const MIN_MEMBERS_FOR_ROAST = 4; // לפחות 4 חברים לפני שהמצטרף החמישי גורם לטריגר
const MAX_MEMBERS_FOR_ROAST = 12; // יפעל עד 12 אנשים בערוץ (מצטרף 5 עד 12)
const ROAST_COOLDOWN_MS = 60 * 1000; // קירור של דקה בין צליה לצליה באותו ערוץ
const channelRoastCooldowns = new Map(); // Map<channelId, lastRoastTimestamp>

/**
 * פונקציה לבניית סקריפט צליה למשתמש ספציפי (שמעון ושירלי).
 * ✅ מעודכן: משתמש ב-getScriptByUserId וב-getLineForUser
 * @param {import('discord.js').GuildMember} memberToRoast - המשתמש שצולים.
 * @returns {Array<Object>} מערך אובייקטים {speaker: 'shimon'/'shirley', text: '...'}.
 */
function buildRoastScriptForMember(memberToRoast) {
    const userId = memberToRoast.id; // ✅ תיקון: הוסר הרווח
    const displayName = memberToRoast.displayName;
    const roastLines = [];

    // נסה למצוא סקריפט אישי למשתמש דרך getScriptByUserId
    const selectedScript = getScriptByUserId(userId); 
    
    // וודא שהסקריפט שנמצא מכיל את שני הדוברים הנדרשים לצליה
    if (selectedScript && selectedScript.shimon && selectedScript.shirley) { 
        log(`[ROAST] מצא סקריפט צליה אישי/כללי ל- ${displayName}.`);
        // שמעון מתחיל
        if (selectedScript.shimon) {
            roastLines.push({ speaker: 'shimon', text: selectedScript.shimon.replace(/{name}/g, displayName) });
        }
        // שירלי ממשיכה
        if (selectedScript.shirley) {
            roastLines.push({ speaker: 'shirley', text: selectedScript.shirley.replace(/{name}/g, displayName) });
        }
        // פאנץ' ליין (שמעון) - אופציונלי
        if (selectedScript.punch) {
            roastLines.push({ speaker: 'shimon', text: selectedScript.punch.replace(/{name}/g, displayName) });
        }
    } else {
        // ✅ אם אין סקריפט ספציפי או שהוא לא מלא, נשתמש ב-getLineForUser
        log(`[ROAST] לא נמצא סקריפט צליה מלא/אישי ל- ${displayName}. משתמש ב-getLineForUser.`);
        const genericLine = getLineForUser(userId, displayName); // ✅ קריאה ל-getLineForUser
        roastLines.push({ speaker: 'shimon', text: genericLine });
        // ניתן להוסיף שורת תגובה משירלי גם כאן אם רוצים
        roastLines.push({ speaker: 'shirley', text: `שמעון, נראה ש${displayName} לא נערך לכניסה כזו. אני כאן כדי לוודא שישמעו אותו היטב.` });
    }

    return roastLines;
}

/**
 * טוען את מצב הפודקאסט מ-Firestore בעת עליית הבוט, ומתאים לשעות הפעילות.
 */
async function initializePodcastState() {
    console.log('[PODCAST_STATE] מאתחל מצב פודקאסט...');
    const savedState = await loadBotState(PODCAST_STATE_KEY);
    
    // ✅ שימוש ב-dayjs ובאזור זמן מדויק להשוואת שעות
    const jerusalemTime = dayjs().tz('Asia/Jerusalem');
    const jerusalemHour = jerusalemTime.hour();
    const isCurrentlyActiveHours = (jerusalemHour >= 18 || jerusalemHour < 6); // 18:00 עד 05:59

    console.log(`[PODCAST_STATE] שעה נוכחית בירושלים: ${jerusalemTime.format('HH:mm')}. שעות פעילות: ${isCurrentlyActiveHours}`);

    if (savedState) {
        console.log(`[PODCAST_STATE] מצב שמור נמצא: monitoringEnabled=${savedState.podcastMonitoringEnabled}.`);
        if (savedState.podcastMonitoringEnabled || isCurrentlyActiveHours) {
            podcastMonitoringEnabled = true;
            console.log('[PODCAST_STATE] ניטור הופעל על בסיס מצב שמור או שעות פעילות נוכחיות.');
        } else {
            podcastMonitoringEnabled = false;
            console.log('[PODCAST_STATE] ניטור כבוי על בסיס מצב שמור או שעות פעילות נוכחיות.');
        }
    } else {
        // אם אין מצב שמור בכלל, קבע לפי השעות הנוכחיות
        console.log(`[PODCAST_STATE] לא נמצא מצב שמור. קובע לפי שעות פעילות נוכחיות: ${isCurrentlyActiveHours}`);
        podcastMonitoringEnabled = isCurrentlyActiveHours;
    }

    // וודא שהמצב הנוכחי נשמר (כדי שה-Cron Jobs הבאים לא יצטרכו לנחש)
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
    const connectionExists = global.client && 
                           global.client.voiceConnections instanceof Collection && 
                           global.client.voiceConnections.has(activePodcastChannelId);
    
    log(`[DEBUG] isBotPodcasting check: isPodcastActive=${isPodcastActive}, connectionExists=${connectionExists}, activePodcastChannelId=${activePodcastChannelId}, requestedChannelId=${channelId}`);
    
    return isPodcastActive && connectionExists && (channelId === null || activePodcastChannelId === channelId);
}

/**
 * מטפל בלוגיקת הפעלת הפודקאסט (צליה) כאשר התנאים מתקיימים.
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
    const memberTriggered = newState.member; // המשתמש שגרם ל-voiceStateUpdate

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

    // 🎯 טיפול בהצטרפות לערוץ וטריגר "צליה"
    if (newChannel && !oldChannel) { // משתמש הצטרף לערוץ
        log(`[DEBUG] User joined channel: ${newChannel.name}.`);

        if (isPodcastActive) { 
            log('[DEBUG] Bot is already active with a roast/podcast. Skipping new trigger.');
            return; 
        }

        const humanMembers = newChannel.members.filter(m => !m.user.bot);
        const memberCount = humanMembers.size;
        log(`[DEBUG] Human member count in ${newChannel.name}: ${memberCount}`);

        const currentRoastCooldown = channelRoastCooldowns.get(newChannel.id) || 0;
        const now = Date.now();

        if (memberCount > MIN_MEMBERS_FOR_ROAST && memberCount <= MAX_MEMBERS_FOR_ROAST && (now - currentRoastCooldown > ROAST_COOLDOWN_MS)) {
            log(`🎯 טריגר צליה: משתמש ${memberTriggered.displayName} הצטרף. ספירת חברים: ${memberCount}.`);
            
            try {
                isPodcastActive = true; 
                activePodcastChannelId = newChannel.id; 
                channelRoastCooldowns.set(newChannel.id, now); 

                const roastScriptLines = buildRoastScriptForMember(memberTriggered); // ✅ קריאה ל-buildRoastScriptForMember

                const connection = joinVoiceChannel({
                    channelId: newChannel.id,
                    guildId: newChannel.guild.id,
                    adapterCreator: newChannel.guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false,
                });
                const player = createAudioPlayer();
                connection.subscribe(player);

                if (!(client.voiceConnections instanceof Collection) || !(client.audioPlayers instanceof Collection)) {
                    console.error('🛑 ERROR: client.voiceConnections or client.audioPlayers are not initialized as Collections! Cannot save connection.');
                    throw new Error('Voice collections not ready. Cannot start podcast.');
                }
                client.voiceConnections.set(newChannel.id, connection); 
                client.audioPlayers.set(newChannel.id, player); 

                log('[DEBUG] Generating and playing roast audio...');
                for (const line of roastScriptLines) {
                    if (line.text?.trim()) {
                        const audioBuffer = await synthesizeElevenTTS(line.text, line.speaker);
                        const resource = createAudioResource(audioBuffer);
                        player.play(resource);
                        await entersState(player, AudioPlayerStatus.Playing, 5000); 
                        await entersState(player, AudioPlayerStatus.Idle, 15000); 
                    }
                }
                log('🎙️ צליה הסתיימה בהצלחה.');

            } catch (error) {
                console.error('🛑 שגיאה בהפעלת צליה:', error);
                log(`❌ שגיאה בהפעלת צליה בערוץ ${newChannel.name}: ${error.message}`);
            } finally {
                log('[DEBUG] Roast finished or encountered error. Stopping and resetting state.');
                await stopPodcast(newChannel.id); 
            }
        } else {
            log(`[DEBUG] Member count (${memberCount}) or cooldown not met for roast trigger. Skipping.`);
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
        if (global.client.voiceConnections instanceof Collection && global.client.audioPlayers instanceof Collection) {
            const connection = global.client.voiceConnections.get(channelId); 
            if (connection) {
                log('[DEBUG] Destroying voice connection.');
                connection.destroy();
                global.client.voiceConnections.delete(channelId);
                global.client.audioPlayers.delete(channelId);
            } else {
                log('[DEBUG] No active voice connection found for this channel ID. It might have already been destroyed.');
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