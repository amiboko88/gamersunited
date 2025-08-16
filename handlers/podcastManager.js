// 📁 managers/podcastManager.js
const { log } = require('../utils/logger');
const ttsEngine = require('../tts/ttsEngine.elevenlabs.js');
const profiles = require('../data/profiles.js');
const voiceQueue = require('./voiceQueue.js');

// --- הגדרות הפודקאסט ---
const FIFO_CHANNEL_ID = '1142436125354958938';
const MIN_USERS_FOR_PODCAST = 4;
const PODCAST_COOLDOWN = 1 * 60 * 1000;
const restrictedCommands = ['soundboard', 'song'];

// --- משתני ניהול מצב ---
let isPodcastActive = false;
let podcastCooldown = false;
const spokenUsers = new Set();

/**
 * מאתחל את מצב הפודקאסט.
 */
function initializePodcastState() {
    isPodcastActive = false;
    podcastCooldown = false;
    spokenUsers.clear();
    log('[PODCAST] מנהל הפודקאסט אותחל בהצלחה.');
}

/**
 * מחזיר אם הפודקאסט פעיל כרגע.
 * @returns {boolean}
 */
function getPodcastStatus() {
    return isPodcastActive;
}

/**
 * נקודת הכניסה הראשית מ-voiceHandler.js.
 */
async function handleVoiceStateUpdate(oldState, newState) {
    const newChannel = newState.channel;
    const oldChannel = oldState.channel;
    const client = newState.client;

    if (oldChannel?.id === newChannel?.id) return;

    if (oldChannel?.id === FIFO_CHANNEL_ID) {
        const membersInOldChannel = oldChannel.members.filter(m => !m.user.bot);
        if (membersInOldChannel.size < MIN_USERS_FOR_PODCAST && isPodcastActive) {
            log(`[PODCAST] מספר המשתמשים ירד מתחת ל-${MIN_USERS_FOR_PODCAST}. מפסיק את הפודקאסט.`);
            isPodcastActive = false;
            spokenUsers.clear();
            podcastCooldown = true;
            setTimeout(() => {
                podcastCooldown = false;
                log('[PODCAST] תקופת הצינון של הפודקאסט הסתיימה.');
            }, PODCAST_COOLDOWN);
        }
    }

    if (newChannel?.id === FIFO_CHANNEL_ID) {
        const membersInNewChannel = newChannel.members.filter(m => !m.user.bot);
        const memberCount = membersInNewChannel.size;

        const shouldStart = memberCount >= MIN_USERS_FOR_PODCAST && !isPodcastActive && !podcastCooldown;
        const shouldAnnounce = isPodcastActive && !spokenUsers.has(newState.member.id);

        if (shouldStart || shouldAnnounce) {
            if (shouldStart) {
                log(`[PODCAST] זוהתה כניסה לערוץ. ${memberCount} משתמשים נוכחים. מתחיל את הפודקאסט.`);
                isPodcastActive = true;
            } else {
                log(`[PODCAST] משתמש חדש, ${newState.member.displayName}, הצטרף בזמן פודקאסט פעיל.`);
            }
            
            spokenUsers.add(newState.member.id);
            await playPersonalPodcast(newChannel, newState.member, client);
        }
    }
}

/**
 * "הבמאי": בונה ומפעיל פודקאסט אישי קצר.
 */
async function playPersonalPodcast(channel, member, client) {
    const userId = member.id;
    const userName = member.displayName;
    const userProfileLines = profiles.playerProfiles[userId];
    let script = [];

    if (Array.isArray(userProfileLines) && userProfileLines.length > 0) {
        log(`[PODCAST] נמצא פרופיל למשתמש ${userName}. בונה תסריט אישי...`);
        const shuffledLines = [...userProfileLines].sort(() => 0.5 - Math.random());
        const selectedLines = shuffledLines.slice(0, 3);
        script.push({ speaker: 'shimon', text: selectedLines[0] });
        if (selectedLines[1]) script.push({ speaker: 'shirly', text: selectedLines[1] });
        if (selectedLines[2]) script.push({ speaker: 'shimon', text: selectedLines[2] });
    } else {
        log(`[PODCAST] לא נמצא פרופיל למשתמש ${userName}. יוצר תסריט גיבוי.`);
        script = [
            { speaker: 'shimon', text: `תראי שירלי, יש לנו אורח חדש, ${userName}.` },
            { speaker: 'shirly', text: `נחמד, בוא נראה אם הוא ישרוד יותר מהקודם.` }
        ];
    }
    
    if (script.length === 0) {
        log('[PODCAST] אזהרה: לא נוצר תסריט. מדלג על הניגון.');
        return;
    }

    log(`[PODCAST] התסריט שנוצר: \n${script.map(line => `${line.speaker}: ${line.text}`).join('\n')}`);
    try {
        const audioBuffers = await ttsEngine.synthesizeConversation(script, member);
        log(`[PODCAST] מעביר ${audioBuffers.length} קטעי שמע למנהל התורים.`);
        for (const buffer of audioBuffers) {
            voiceQueue.addToQueue(channel.guild.id, channel.id, buffer, client);
        }
    } catch (error) {
        log('❌ [PODCAST] שגיאה בהפקת או העברת הפודקאסט למנהל התורים:', error);
    }
}

module.exports = {
    handleVoiceStateUpdate,
    initializePodcastState,
    getPodcastStatus,
    restrictedCommands,
    // ✅ [תיקון] הוספת הפונקציה לייצוא כדי שתהיה זמינה לקבצים אחרים
    playPersonalPodcast 
};