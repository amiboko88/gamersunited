// 📁 managers/podcastManager.js
const logger = require('../utils/logger');
const ttsEngine = require('../tts/ttsEngine.elevenlabs.js');
const profiles = require('../data/profiles.js');
// const fifoLines = require('../data/fifoLines.js'); // ✅ הוסר כפי שביקשת
const voiceQueue = require('./voiceQueue.js');

// --- הגדרות הפודקאסט ---
const FIFO_CHANNEL_ID = '1142436125354958938';
const MIN_USERS_FOR_PODCAST = 4;
const PODCAST_COOLDOWN = 1 * 60 * 1000;

// --- משתני ניהול מצב ---
let isPodcastActive = false;
let podcastCooldown = false;
const spokenUsers = new Set();

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
            logger.info(`מספר המשתמשים ירד מתחת ל-${MIN_USERS_FOR_PODCAST}. מפסיק את הפודקאסט.`);
            isPodcastActive = false;
            spokenUsers.clear();
            podcastCooldown = true;
            setTimeout(() => {
                podcastCooldown = false;
                logger.info('תקופת הצינון של הפודקאסט הסתיימה.');
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
                logger.info(`זוהתה כניסה לערוץ. ${memberCount} משתמשים נוכחים. מתחיל את הפודקאסט.`);
                isPodcastActive = true;
            } else {
                logger.info(`משתמש חדש, ${newState.member.displayName}, הצטרף בזמן פודקאסט פעיל.`);
            }
            
            spokenUsers.add(newState.member.id);
            // ✅ [שדרוג] קריאה לפונקציית הבמאי החדשה
            await playPersonalPodcast(newChannel, newState.member, client);
        }
    }
}

/**
 * ✅ [שדרוג] "הבמאי": בונה ומפעיל פודקאסט אישי קצר.
 */
async function playPersonalPodcast(channel, member, client) {
    const userId = member.id;
    const userName = member.displayName;
    const userProfileLines = profiles.playerProfiles[userId];
    let script = [];

    // --- בניית התסריט ---
    if (Array.isArray(userProfileLines) && userProfileLines.length > 0) {
        // מקרה 1: למשתמש יש פרופיל אישי
        logger.info(`נמצא פרופיל למשתמש ${userName}. בונה תסריט אישי...`);
        
        // מערבב את המשפטים כדי לקבל תוצאה שונה כל פעם
        const shuffledLines = [...userProfileLines].sort(() => 0.5 - Math.random());
        
        // לוקח עד 3 משפטים ליצירת שיחה קצרה
        const selectedLines = shuffledLines.slice(0, 3);

        // מחלק את התפקידים בין שמעון לשירלי
        script.push({ speaker: 'shimon', text: selectedLines[0] });
        if (selectedLines[1]) {
            script.push({ speaker: 'shirly', text: selectedLines[1] });
        }
        if (selectedLines[2]) {
            // שמעון נותן את הפאנץ'
            script.push({ speaker: 'shimon', text: selectedLines[2] });
        }

    } else {
        // מקרה 2: משתמש חדש, יוצר תסריט גיבוי קצר
        logger.info(`לא נמצא פרופיל למשתמש ${userName}. יוצר תסריט גיבוי.`);
        script = [
            { speaker: 'shimon', text: `תראי שירלי, יש לנו אורח חדש, ${userName}.` },
            { speaker: 'shirly', text: `נחמד, בוא נראה אם הוא ישרוד יותר מהקודם.` }
        ];
    }
    
    if (script.length === 0) {
        logger.warn('לא נוצר תסריט. מדלג על הניגון.');
        return;
    }

    logger.info(`התסריט שנוצר: \n${script.map(line => `${line.speaker}: ${line.text}`).join('\n')}`);

    try {
        // --- הפקה והעברה לשידור ---
        // 1. יוצר את כל קטעי האודיו של השיחה
        const audioBuffers = await ttsEngine.synthesizeConversation(script, member);
        
        // 2. מעביר כל קטע שמע לתור הניגון, אחד אחרי השני
        logger.info(`מעביר ${audioBuffers.length} קטעי שמע למנהל התורים.`);
        for (const buffer of audioBuffers) {
            voiceQueue.addToQueue(channel.guild.id, channel.id, buffer, client);
        }

    } catch (error) {
        logger.error('שגיאה בהפקת או העברת הפודקאסט למנהל התורים:', error);
    }
}

// המודול מייצא רק את נקודת הכניסה הראשית
module.exports = {
    handleVoiceStateUpdate
};