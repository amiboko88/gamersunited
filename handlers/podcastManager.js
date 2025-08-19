// 📁 managers/podcastManager.js (גרסה יציבה ומתוקנת סופית)
const { log } = require('../utils/logger');
const ttsEngine = require('../tts/ttsEngine.elevenlabs.js');
const profiles = require('../data/profiles.js');
const voiceQueue = require('./voiceQueue.js');

const FIFO_CHANNEL_ID = process.env.FIFO_CHANNEL_ID;
const MIN_USERS_FOR_PODCAST = 4;
const PODCAST_COOLDOWN = 1 * 60 * 1000;
const restrictedCommands = ['soundboard', 'song'];

const GENERIC_GREETINGS = [
    { shimon: 'תראי שירלי, בשר טרי הגיע. ברוך הבא, {userName}.', shirly: 'נקווה שהוא לא יתפרק מהר כמו הקודמים.' },
    { shimon: 'שימי לב, {userName} הצטרף אלינו. נראה מבטיח.', shirly: 'כולם נראים מבטיחים בהתחלה, שמעון. השאלה היא איך הם מסיימים.' },
    { shimon: 'עוד אחד נפל ברשת. שלום לך, {userName}.', shirly: 'השאלה היא אם זו רשת של דייגים או רשת של עכבישים.' },
    { shimon: '{userName} נחת בלובי. תכיני את עצמך.', shirly: 'אני תמיד מוכנה. השאלה אם הוא מוכן למה שמצפה לו.' },
    { shimon: 'קבלו את הכוכב החדש שלנו, {userName}!', shirly: 'כוכב או כוכב נופל? רק הזמן יגיד.' },
    { shimon: 'נראה ש-{userName} החליט להצטרף לחגיגה. מעניין אם הוא הביא מתנות.', shirly: 'המתנה הכי טובה שהוא יכול להביא זה קצת סקיל.' },
    { shimon: 'הגעתו של {userName} מסמנת עידן חדש. או עוד ערב של הפסדים.', shirly: 'אני מהמרת על האפשרות השנייה, שמעון.' },
    { shimon: 'שקט, שקט... נראה לי ששמעתי משהו. אה, זה רק {userName} שהתחבר.', shirly: 'חבל, קיוויתי שזה היה הד של הניצחון האחרון שלנו. שכחתי שאין כזה.' },
    { shimon: 'ברוך הבא, {userName}. אל תדאג, אנחנו לא נושכים. בדרך כלל.', shirly: 'רק כשאנחנו מפסידים. כלומר, אנחנו נושכים הרבה.' },
    { shimon: 'הנה מגיע {userName}, רענן ומוכן לקרב!', shirly: 'בוא נראה כמה זמן הרעננות הזאת תחזיק מעמד.' },
    { shimon: 'שימו לב, {userName} איתנו. המשחק עומד להשתנות.', shirly: 'לרעה או לטובה? זאת השאלה האמיתית.' },
    { shimon: 'הצטרף אלינו {userName}. תגיד שלום, ותקווה לטוב.', shirly: 'תקווה זה נחמד, אבל כוונת טובה יותר.' },
    { shimon: 'מה זה הרעש הזה? אה, המערכת מזהה כניסה של {userName}.', shirly: 'מעניין, המערכת שלי מזהה בעיקר כאב ראש מתקרב.' },
    { shimon: 'טוב, {userName} כאן. עכשיו אפשר להתחיל ברצינות.', shirly: 'התכוונת, עכשיו אפשר להתחיל להפסיד ברצינות.' },
    { shimon: 'זהירות, {userName} בשטח. כולם לתפוס מחסה!', shirly: 'הלוואי שהאויבים היו אומרים את זה עליו.' }
];

let isPodcastActive = false;
let podcastCooldown = false;
const spokenUsers = new Set();

function initializePodcastState() {
    isPodcastActive = false;
    podcastCooldown = false;
    spokenUsers.clear();
    log('[PODCAST] מנהל הפודקאסט אותחל.');
}

function getPodcastStatus() { return isPodcastActive; }

async function handleVoiceStateUpdate(oldState, newState) {
    const { channel: newChannel, client, member, guild } = newState;

    if (oldState.channelId === newState.channelId) return;

    // ✅ [תיקון קריסה סופי] לוגיקה חדשה ועמידה המבוססת על המידע העדכני ביותר
    if (oldState.channelId === FIFO_CHANNEL_ID && isPodcastActive) {
        const oldChannel = guild.channels.cache.get(oldState.channelId);
        if (oldChannel) { // בודקים שהערוץ עדיין קיים בזיכרון
            const members = oldChannel.members.filter(m => !m.user.bot);
            if (members.size < MIN_USERS_FOR_PODCAST) {
                log(`[PODCAST] מספר המשתמשים ירד מתחת ל-${MIN_USERS_FOR_PODCAST}. מסיים את הפודקאסט.`);
                isPodcastActive = false;
                spokenUsers.clear();
                podcastCooldown = true;
                setTimeout(() => { podcastCooldown = false; log('[PODCAST] תקופת הצינון הסתיימה.'); }, PODCAST_COOLDOWN);
            }
        }
    }

    if (newChannel?.id === FIFO_CHANNEL_ID) {
        const members = newChannel.members.filter(m => !m.user.bot);
        const shouldStart = members.size >= MIN_USERS_FOR_PODCAST && !isPodcastActive && !podcastCooldown;
        const shouldAnnounce = isPodcastActive && !spokenUsers.has(member.id);

        if (shouldStart || shouldAnnounce) {
            if (shouldStart) {
                log(`[PODCAST] התנאים התקיימו (${members.size} משתמשים). מתחיל פודקאסט.`);
                isPodcastActive = true;
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
        const selectedLines = [...userProfileLines].sort(() => 0.5 - Math.random()).slice(0, 3);
        script.push({ speaker: 'shimon', text: selectedLines[0] });
        if (selectedLines[1]) script.push({ speaker: 'shirly', text: selectedLines[1] });
        if (selectedLines[2]) script.push({ speaker: 'shimon', text: selectedLines[2] });
    } else {
        const greeting = GENERIC_GREETINGS[Math.floor(Math.random() * GENERIC_GREETINGS.length)];
        script = [
            { speaker: 'shimon', text: greeting.shimon.replace('{userName}', userName) },
            { speaker: 'shirly', text: greeting.shirly.replace('{userName}', userName) }
        ];
    }
    
    if (script.length === 0) return;

    const audioBuffers = await ttsEngine.synthesizeConversation(script, member);
    if (audioBuffers.length > 0) {
        log(`[PODCAST] מעביר ${audioBuffers.length} קטעי שמע לתור הניגון.`);
        for (const buffer of audioBuffers) {
            voiceQueue.addToQueue(channel.guild.id, channel.id, buffer, client);
        }
    }
}

module.exports = {
    handleVoiceStateUpdate,
    initializePodcastState,
    getPodcastStatus,
    restrictedCommands,
    playPersonalPodcast 
};