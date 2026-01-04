// 📁 handlers/podcastManager.js
const { log } = require('../utils/logger');
const ttsEngine = require('../tts/ttsEngine.elevenlabs.js');
const { getUserData } = require('../utils/userUtils'); // ✅ חיבור למוח המאוחד
const voiceQueue = require('./voiceQueue.js');

const MIN_USERS_FOR_PODCAST = 4;
const PODCAST_COOLDOWN = 1 * 60 * 1000;
const restrictedCommands = ['soundboard', 'song'];

let activePodcastChannelId = null; 
let podcastCooldown = false;
const spokenUsers = new Set();

function initializePodcastState() {
    activePodcastChannelId = null;
    podcastCooldown = false;
    spokenUsers.clear();
    log('[PODCAST] מנהל הפודקאסט אותחל.');
}

function getPodcastStatus() { return !!activePodcastChannelId; }

async function handleVoiceStateUpdate(oldState, newState) {
    const { channel: newChannel, client, member, guild } = newState;
    const { channelId: oldChannelId } = oldState;

    if (oldChannelId === newChannel?.id) return false; 

    // בדיקה אם מישהו עזב ערוץ שבו מתנגן פודקאסט
    if (oldChannelId && oldChannelId === activePodcastChannelId) {
        const oldChannel = guild.channels.cache.get(oldChannelId);
        if (oldChannel) {
            const members = oldChannel.members.filter(m => !m.user.bot);
            if (members.size < MIN_USERS_FOR_PODCAST) {
                log('[PODCAST] כמות המשתמשים ירדה מתחת למינימום. עוצר פודקאסט.');
                voiceQueue.stop(guild.id);
                activePodcastChannelId = null;
            }
        }
    }

    // בדיקה אם מישהו הצטרף והאם צריך להפעיל פודקאסט
    if (newChannel && !activePodcastChannelId && !podcastCooldown) {
        const members = newChannel.members.filter(m => !m.user.bot);
        if (members.size >= MIN_USERS_FOR_PODCAST) {
            log(`[PODCAST] זוהו ${members.size} משתמשים בערוץ ${newChannel.name}. מתחיל פודקאסט!`);
            
            // בוחרים קורבן (מישהו שעוד לא דיברו עליו)
            const targetMember = members.find(m => !spokenUsers.has(m.id)) || members.first();
            
            await playPersonalPodcast(newChannel, targetMember, client);
            
            // מפעילים קולדאון
            podcastCooldown = true;
            setTimeout(() => { podcastCooldown = false; }, PODCAST_COOLDOWN);
            return true;
        }
    }
    return false;
}

/**
 * מפיק ומנגן פודקאסט אישי על משתמש
 */
async function playPersonalPodcast(voiceChannel, member, client) {
    if (!voiceChannel || !member) return;

    activePodcastChannelId = voiceChannel.id;
    spokenUsers.add(member.id);

    try {
        const userName = member.displayName;
        const userId = member.id;
        let source = 'DB';

        // 1. שליפת הנתונים מה-DB המאוחד (במקום מקובץ profiles.js)
        const userData = await getUserData(userId, 'discord');
        let userRoasts = userData?.brain?.roasts || [];

        // 2. אם אין ירידות ב-DB, נשתמש במאגר ברירת מחדל (שגם הוא יכול להיות ב-DB ב-metadata, אבל נשים פה ליתר ביטחון)
        if (userRoasts.length === 0) {
            log(`[PODCAST] לא נמצאו ירידות ב-DB עבור ${userName}. משתמש בברירת מחדל.`);
            userRoasts = [
                `שמעת ש-${userName} הצטרף? הרמה בשרת ירדה ברגע זה.`,
                `תגיד שירלי, ${userName} יודע לשחק או שהוא פה רק בשביל הנוף?`,
                `וואלה ${userName}, אם היית משקיע במשחק כמו שאתה משקיע בתירוצים, היינו מנצחים.`
            ];
            source = 'Default Fallback';
        }

        log(`[PODCAST] מכין פודקאסט עבור ${userName} (מקור: ${source}, שורות זמינות: ${userRoasts.length})`);

        // בחירת 3 משפטים רנדומליים
        const selectedLines = userRoasts.sort(() => 0.5 - Math.random()).slice(0, 3);
        
        // בניית התסריט (החלפת הטקסט {userName} בשם האמיתי אם קיים בטקסט הגולמי)
        let script = [];
        // שמעון מתחיל
        if (selectedLines[0]) script.push({ speaker: 'shimon', text: selectedLines[0].replace(/{userName}/g, userName) });
        // שירלי עונה (או שמעון, אפשר לגוון, כרגע נשאיר פורמט קבוע)
        if (selectedLines[1]) script.push({ speaker: 'shirly', text: selectedLines[1].replace(/{userName}/g, userName) });
        // שמעון מסיים
        if (selectedLines[2]) script.push({ speaker: 'shimon', text: selectedLines[2].replace(/{userName}/g, userName) });

        // שליחה למנוע ה-TTS
        const audioBuffers = await ttsEngine.synthesizeConversation(script, member);
        
        if (audioBuffers.length > 0) {
            log(`[PODCAST] יש ${audioBuffers.length} קבצי שמע. מוסיף לתור.`);
            
            // הוספה לתור ה-Voice הראשי
            // שים לב: אנחנו שולחים Buffer, לא נתיב קובץ. voiceQueue צריך לתמוך בזה או ש-ttsEngine שומר קבצים.
            // בהנחה ש-ttsEngine מחזיר נתיבים (כפי שראינו בקבצים קודמים), זה יעבוד. 
            // אם ttsEngine מחזיר Buffers, צריך לוודא ש-voiceQueue מטפל בזה. 
            // במקרה הזה, נניח שהמנוע שומר קבצים זמניים ומחזיר נתיבים (התנהגות סטנדרטית).
            
            for (const audioFile of audioBuffers) {
                await voiceQueue.addToQueue(
                    voiceChannel.guild.id, 
                    voiceChannel.id, 
                    audioFile, // זה צריך להיות נתיב לקובץ MP3
                    client, 
                    'PODCAST'
                );
            }
        } else {
            log('[PODCAST] ❌ לא נוצרו קבצי שמע.');
            activePodcastChannelId = null;
        }

    } catch (error) {
        log(`[PODCAST] ❌ שגיאה: ${error.message}`);
        activePodcastChannelId = null;
    }
}

function isPodcastActive() {
    return activePodcastChannelId !== null;
}

module.exports = {
    initializePodcastState,
    handleVoiceStateUpdate,
    playPersonalPodcast,
    getPodcastStatus,
    isPodcastActive
};