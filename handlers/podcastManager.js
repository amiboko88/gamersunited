// 📁 managers/podcastManager.js (משודרג לפעולה בכל הערוצים)
const { log } = require('../utils/logger');
const ttsEngine = require('../tts/ttsEngine.elevenlabs.js');
const profiles = require('../data/profiles.js');
const voiceQueue = require('./voiceQueue.js');

// --- הגדרות הפודקאסט ---
const MIN_USERS_FOR_PODCAST = 4;
const PODCAST_COOLDOWN = 1 * 60 * 1000;
const restrictedCommands = ['soundboard', 'song'];

// ✅ [שדרוג] הברכות הוחלפו לגרסה קצרה, קולעת וגסה יותר
const GENERIC_GREETINGS = [
    { shimon: 'מי זה הנכה הזה שהצטרף?', shirly: 'עוד אפס לצוות. ברוך הבא, {userName}.' },
    { shimon: 'טוב, {userName} פה. הלך המשחק.', shirly: 'לפחות יש על מי לצחוק.' },
    { shimon: 'שירלי, תראי. {userName} נכנס.', shirly: 'יופי. בדיוק היה חסר לנו בוט.' },
    { shimon: 'מה זה הריח הזה? אה, זה {userName} הגיע.', shirly: 'תסגרו חלונות, הגיע זבל.' },
    { shimon: 'קלטו את {userName}. נראה כמו פרי קיל.', shirly: 'הוא פרי קיל רק אם הוא בצד השני. אצלנו הוא סתם פרי.' },
    { shimon: 'טוב, {userName} כאן.', shirly: 'מי?' },
    { shimon: 'עוד גופה הגיעה ללובי. שלום {userName}.', shirly: 'אל תדאג, אנחנו נסחוב אותך. או שלא.' },
    { shimon: 'שיט, {userName} התחבר.', shirly: 'נו, לפחות יהיה מצחיק לראות אותו מת.' },
    { shimon: 'מי פתח את הדלת ל-{userName}?', shirly: 'הוא נראה אבוד. בטח חשב שזה לובי של בוטים.' },
    { shimon: 'הנה הגיע {userName}. האיש שהופך כל ניצחון להפסד.', shirly: 'שמעון, תהיה אופטימי. אולי הפעם הוא רק ימות ראשון.' }
];

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

    if (oldChannelId === newChannel?.id) return; // לא קרה שינוי ערוץ

    // בודק אם משתמש עזב את הערוץ שבו הפודקאסט פעיל
    if (oldChannelId && oldChannelId === activePodcastChannelId) {
        const oldChannel = guild.channels.cache.get(oldChannelId);
        if (oldChannel) {
            const members = oldChannel.members.filter(m => !m.user.bot);
            if (members.size < MIN_USERS_FOR_PODCAST) {
                log(`[PODCAST] מספר המשתמשים בערוץ ${oldChannel.name} ירד מתחת ל-${MIN_USERS_FOR_PODCAST}. מסיים את הפודקאסט.`);
                activePodcastChannelId = null;
                spokenUsers.clear();
                podcastCooldown = true;
                setTimeout(() => { podcastCooldown = false; log('[PODCAST] תקופת הצינון הסתיימה.'); }, PODCAST_COOLDOWN);
            }
        }
    }

    // בודק אם משתמש הצטרף לערוץ כלשהו ועומד בתנאים
    if (newChannel) {
        const members = newChannel.members.filter(m => !m.user.bot);
        const isPodcastActiveInThisChannel = newChannel.id === activePodcastChannelId;
        
        // התנאים:
        // 1. יש מספיק אנשים בערוץ
        // 2. אין פודקאסט שפעיל כרגע (בשום ערוץ אחר)
        // 3. הבוט לא בתקופת צינון
        const shouldStart = members.size >= MIN_USERS_FOR_PODCAST && !getPodcastStatus() && !podcastCooldown;
        
        // התנאי להכרזה:
        // 1. הפודקאסט כבר פעיל בערוץ הזה
        // 2. המשתמש הספציפי הזה עוד לא דובר
        const shouldAnnounce = isPodcastActiveInThisChannel && !spokenUsers.has(member.id);

        if (shouldStart || shouldAnnounce) {
            if (shouldStart) {
                log(`[PODCAST] התנאים התקיימו בערוץ ${newChannel.name} (${members.size} משתמשים). מתחיל פודקאסט.`);
                activePodcastChannelId = newChannel.id; // נועל את הפודקאסט לערוץ הזה
            }
            
            // מוסיף את המשתמש לרשימת "דוברים" כדי לא להכריז עליו שוב
            spokenUsers.add(member.id);
            // קורא לפונקציה שתכין את התסריט ותשלח לניגון
            await playPersonalPodcast(newChannel, member, client);
        }
    }
}

async function playPersonalPodcast(channel, member, client) {
    const { id: userId, displayName: userName } = member;
    const userProfileLines = profiles.playerProfiles[userId];
    let script = [];

    if (Array.isArray(userProfileLines) && userProfileLines.length > 0) {
        // בוחר 3 "רוסטים" אישיים אקראיים
        const selectedLines = [...userProfileLines].sort(() => 0.5 - Math.random()).slice(0, 3);
        script.push({ speaker: 'shimon', text: selectedLines[0] });
        if (selectedLines[1]) script.push({ speaker: 'shirly', text: selectedLines[1] });
        if (selectedLines[2]) script.push({ speaker: 'shimon', text: selectedLines[2] });
    } else {
        // בוחר ברכה גנרית (מהרשימה הגסה החדשה)
        const greeting = GENERIC_GREETINGS[Math.floor(Math.random() * GENERIC_GREETINGS.length)];
        script = [
            { speaker: 'shimon', text: greeting.shimon.replace('{userName}', userName) },
            { speaker: 'shirly', text: greeting.shirly.replace('{userName}', userName) }
        ];
    }
    
    if (script.length === 0) {
        log('[PODCAST] ⚠️ נוצר תסריט ריק. מדלג על הניגון.');
        return;
    }

    // שולח את התסריט למנוע v3 המשודרג שלנו
    const audioBuffers = await ttsEngine.synthesizeConversation(script, member);
    
    if (audioBuffers.length > 0) {
        log(`[PODCAST] מעביר ${audioBuffers.length} קטעי שמע לתור הניגון.`);
        for (const buffer of audioBuffers) {
            voiceQueue.addToQueue(channel.guild.id, channel.id, buffer, client);
        }
    } else {
        log('[PODCAST] ⚠️ ttsEngine החזיר 0 קטעי אודיו. (ייתכן שהייתה שגיאה ב-API של ElevenLabs, בדוק לוגים קודמים)');
    }
}

module.exports = {
    handleVoiceStateUpdate,
    initializePodcastState,
    getPodcastStatus,
    restrictedCommands,
    playPersonalPodcast // מיוצא לשימוש ה-Tester
};