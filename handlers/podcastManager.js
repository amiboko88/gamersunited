// 📁 managers/podcastManager.js (עם טקסטים גנריים משודרגים)
const { log } = require('../utils/logger');
const ttsEngine = require('../tts/ttsEngine.elevenlabs.js'); // שם הקובץ נשאר בכוונה
const profiles = require('../data/profiles.js');
const voiceQueue = require('./voiceQueue.js');

// --- הגדרות הפודקאסט ---
const MIN_USERS_FOR_PODCAST = 4;
const PODCAST_COOLDOWN = 1 * 60 * 1000;
const restrictedCommands = ['soundboard', 'song'];

// ✅ [שדרוג תוכן] הרחבה משמעותית של הברכות והתאמה לטונים החדשים
const GENERIC_GREETINGS = [
    // שמעון כועס / שירלי סטלנית
    { shimon: 'מי זה הנכה הזה שהצטרף?', shirly: 'אוי, {userName} פה... איזה כיף... בוא, שב לידי...' },
    { shimon: 'טוב, {userName} פה. הלך המשחק.', shirly: 'הכל טוב שמעון, תירגע... {userName} דווקא חמוד.' },
    { shimon: 'שירלי, תראי. {userName} נכנס.', shirly: 'היי {userName}... בא לך משהו לגלגל?...' },
    { shimon: 'מה זה הריח הזה? אה, זה {userName} הגיע.', shirly: 'זה ריח טוב, שמעון. זה ריח של... {userName}.' },
    { shimon: 'קלטו את {userName}. נראה כמו פרי קיל.', shirly: 'אני דווקא רואה בו פוטנציאל... פוטנציאל להיות קרוב אלי.' },
    { shimon: 'טוב, {userName} כאן. תפסיקו לצחוק.', shirly: 'היי {userName}, בדיוק חשבתי עליך...' },
    { shimon: 'עוד גופה הגיעה ללובי. שלום {userName}.', shirly: 'אוי, {userName}... איזה שם יפה... תגיד לי אותו שוב?' },
    { shimon: 'שיט, {userName} התחבר.', shirly: 'אני אוהבת כשאתה פה, {userName}... זה עושה לי נעים.' },
    { shimon: 'מי פתח את הדלת ל-{userName}?', shirly: 'אני פתחתי, שמעון... קיוויתי שהוא יבוא.' },
    { shimon: 'הנה הגיע {userName}. האיש שהופך כל ניצחון להפסד.', shirly: 'לא נורא, העיקר הכוונה... והכוונה שלי טובה אליך, {userName}.' },
    { shimon: 'אתם לא רציניים. {userName} שוב פה?', shirly: 'ששש... שמעון... אל תפריע לנו. היי {userName}.' },
    { shimon: 'למה {userName} נכנס? מישהו ביקש ממנו?', shirly: 'אני ביקשתי... בלב.' },
    { shimon: 'נו באמת, {userName}. אין לך מקום אחר להיות בו?', shirly: 'יש לו... פה... איתי.' },
    { shimon: 'אני לא מאמין. {userName}. למה.', shirly: 'למה לא, שמעון? תראה איזה חתיך {userName}.' },
    { shimon: 'אוקיי, השרת הולך לקרוס. {userName} פה.', shirly: 'הלב שלי הולך לקרוס... {userName}...' },
    { shimon: 'די, אני לא יכול יותר. {userName} נכנס.', shirly: 'תנשום, שמעון... הכל רגוע. היי {userName}, בוא תצטרף.' },
    { shimon: 'אמרתי לכם לנעול את הדלת! {userName} בפנים!', shirly: 'אבל אני אוהבת שהוא בפנים... {userName}...' },
    { shimon: 'מישהו יסביר לי מה {userName} עושה פה?', shirly: 'הוא בא לראות אותי, שמעון. נכון, {userName}?' },
    { shimon: 'יופי, הגיע {userName}. עכשיו באמת אין סיכוי.', shirly: 'איתך תמיד יש סיכוי, {userName}... לכל דבר...' },
    { shimon: 'זה לא אמיתי. {userName} נחת.', shirly: 'הוא נחת... ישר לזרועותיי. ברוך הבא, מותק.' }
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

    if (oldChannelId === newChannel?.id) return; 

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
        // ✅ [תיקון באג ה-Stuck] מוודאים שהערוץ החדש הוא לא ערוץ הטסט
        const TEST_CHANNEL_ID = '1396779274173943828';
        if (newChannel.id === TEST_CHANNEL_ID) {
            log('[PODCAST] מזוהה כניסה לערוץ טסט. מנהל הפודקאסט לא יופעל.');
            return;
        }

        const members = newChannel.members.filter(m => !m.user.bot);
        const isPodcastActiveInThisChannel = newChannel.id === activePodcastChannelId;
        
        // ✅ [תיקון לוגיקה] 'או' במקום 'ו' - מתחיל פודקאסט *או* מכריז על מצטרף חדש
        const shouldStart = members.size >= MIN_USERS_FOR_PODCAST && !getPodcastStatus() && !podcastCooldown;
        const shouldAnnounce = isPodcastActiveInThisChannel && !spokenUsers.has(member.id);

        if (shouldStart || shouldAnnounce) {
            if (shouldStart) {
                log(`[PODCAST] התנאים התקיימו בערוץ ${newChannel.name} (${members.size} משתמשים). מתחיל פודקאסט.`);
                activePodcastChannelId = newChannel.id; 
                // ✅ [תיקון לוגיקה] כשמתחילים פודקאסט, יש לרוקן את רשימת הדוברים הקודמת
                spokenUsers.clear();
            }
            
            spokenUsers.add(member.id);
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
        // בוחר ברכה גנרית (מהרשימה החדשה)
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

    // שולח את התסריט למנוע OpenAI המשודרג
    const audioBuffers = await ttsEngine.synthesizeConversation(script, member);
    
    if (audioBuffers.length > 0) {
        log(`[PODCAST] מעביר ${audioBuffers.length} קטעי שמע לתור הניגון.`);
        for (const buffer of audioBuffers) {
            voiceQueue.addToQueue(channel.guild.id, channel.id, buffer, client);
        }
    } else {
        log('[PODCAST] ⚠️ ttsEngine החזיר 0 קטעי אודיו. (ייתכן שהייתה שגיאה ב-API של OpenAI, בדוק לוגים קודמים)');
    }
}

module.exports = {
    handleVoiceStateUpdate,
    initializePodcastState,
    getPodcastStatus,
    restrictedCommands,
    playPersonalPodcast 
};