// 📁 handlers/podcastManager.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, StreamType, VoiceConnectionStatus } = require('@discordjs/voice');
const { synthesizeElevenTTS } = require('../tts/ttsEngine.elevenlabs');
const { getScriptByUserId, getLineForUser } = require('../data/fifoLines');
const { log } = require('../utils/logger');
const { Readable } = require('stream');
const { Collection } = require('discord.js');
const { sendStaffLog } = require('../utils/staffLogger');
const { loadBotState, saveBotState } = require('../utils/botStateManager'); // ✨ ייבוא חסר
const dayjs = require('dayjs'); // ✨ ייבוא חסר
const utc = require('dayjs/plugin/utc'); // ✨ ייבוא חסר
const timezone = require('dayjs/plugin/timezone'); // ✨ ייבוא חסר
dayjs.extend(utc);
dayjs.extend(timezone);


let isPodcastActive = false;
let activePodcastChannelId = null;
let podcastMonitoringEnabled = false; // ✨ הוספת משתנה גלובלי
const PODCAST_STATE_KEY = 'podcastStatus'; // ✨ הוספת מפתח

const MIN_MEMBERS_FOR_ROAST = 2;
const ROAST_COOLDOWN_MS = 30 * 1000;
const channelRoastCooldowns = new Map();

// ✨ --- פונקציה ששוחזרה ---
/**
 * מאתחל את מצב הפודקאסט מטעינה שמורה ב-Firestore.
 * קובע אם ניטור הפודקאסטים צריך להיות פעיל עם עליית הבוט.
 */
async function initializePodcastState() {
    log('[PODCAST_STATE] מאתחל מצב פודקאסט...');
    const savedState = await loadBotState(PODCAST_STATE_KEY);
    
    const jerusalemTime = dayjs().tz('Asia/Jerusalem');
    const jerusalemHour = jerusalemTime.hour();
    // שעות פעילות: מ-18:00 בערב עד 6:00 בבוקר
    const isCurrentlyActiveHours = (jerusalemHour >= 18 || jerusalemHour < 6);

    // קובע את המצב ההתחלתי על בסיס שעות הפעילות
    podcastMonitoringEnabled = isCurrentlyActiveHours;
    log(`[PODCAST_STATE] ניטור פודקאסטים הוגדר ל: ${podcastMonitoringEnabled} (מבוסס שעה).`);
    
    // שומר את המצב העדכני ב-Firestore
    await saveBotState(PODCAST_STATE_KEY, { podcastMonitoringEnabled: podcastMonitoringEnabled });
}


function isBotPodcasting(guildId, channelId = null) {
    return isPodcastActive && (channelId === null || activePodcastChannelId === channelId);
}

function buildRoastScriptForMember(memberToRoast) {
    const userId = memberToRoast.id;
    const displayName = memberToRoast.displayName;
    const script = getScriptByUserId(userId);

    if (script && script.shimon && script.shirley) {
        log(`[ROAST] נמצא סקריפט אישי עבור ${displayName}.`);
        return [
            { speaker: 'shimon', text: script.shimon },
            { speaker: 'shirley', text: script.shirley },
            { speaker: 'shimon', text: script.punch }
        ];
    }

    log(`[ROAST] לא נמצא סקריפט אישי. משתמש ב-fallback.`);
    return [{ speaker: 'shimon', text: getLineForUser(userId, displayName) }];
}

async function stopPodcast(guildId) {
    if (!global.client) return;
    const connection = global.client.voiceConnections?.get(guildId);
    if (connection) {
        try {
            connection.destroy();
        } catch (e) {
            console.error(`[PODCAST] שגיאה בניסיון להרוס חיבור קיים: ${e.message}`);
        }
        global.client.voiceConnections.delete(guildId);
        global.client.audioPlayers?.delete(guildId);
        log(`[PODCAST] חיבור קולי נותק משרת ${guildId}.`);
    }
    isPodcastActive = false;
    activePodcastChannelId = null;
}

async function handlePodcastTrigger(newState) {
    if (!podcastMonitoringEnabled) {
        // אם הניטור כבוי, אל תעשה כלום
        return;
    }
    
    if (!newState.channel || !newState.member) {
        log('[PODCAST] בוטל: חסר מידע על הערוץ או המשתמש.');
        return;
    }

    const { channel, member } = newState;
    const client = member.client;

    if (isBotPodcasting(channel.guild.id)) {
        log(`[PODCAST] בוטל: הבוט כבר פעיל בערוץ אחר.`);
        return;
    }

    const humanMembers = channel.members.filter(m => !m.user.bot);
    const memberCount = humanMembers.size;
    log(`[PODCAST] זוהתה כניסה של ${member.displayName} לערוץ "${channel.name}". סה"כ משתמשים: ${memberCount}`);

    const now = Date.now();
    const lastRoast = channelRoastCooldowns.get(channel.id) || 0;
    if (now - lastRoast < ROAST_COOLDOWN_MS) {
        log(`[PODCAST] בוטל: הערוץ ב-cooldown.`);
        return;
    }

    if (memberCount < MIN_MEMBERS_FOR_ROAST) {
        log(`[PODCAST] בוטל: אין מספיק משתמשים (${memberCount}/${MIN_MEMBERS_FOR_ROAST}).`);
        return;
    }

    let connection;
    try {
        isPodcastActive = true;
        activePodcastChannelId = channel.id;
        channelRoastCooldowns.set(channel.id, now);
        log(`[PODCAST] התחלת "צלייה" על ${member.displayName} בערוץ ${channel.name}...`);

        const roastScript = buildRoastScriptForMember(member);
        
        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 10000);
        log(`[PODCAST] חיבור קולי נוצר בהצלחה.`);

        if (!client.voiceConnections) client.voiceConnections = new Collection();
        if (!client.audioPlayers) client.audioPlayers = new Collection();
        
        client.voiceConnections.set(channel.guild.id, connection);

        const player = createAudioPlayer();
        connection.subscribe(player);
        client.audioPlayers.set(channel.guild.id, player);

        for (const line of roastScript) {
            if (line.text && line.text.trim()) {
                log(`[TTS] יוצר קול עבור: "${line.text}" (קול: ${line.speaker})`);
                const audioBuffer = await synthesizeElevenTTS(line.text, line.speaker);
                const resource = createAudioResource(Readable.from(audioBuffer), { inputType: StreamType.Arbitrary });
                
                player.play(resource);

                await entersState(player, AudioPlayerStatus.Playing, 5000);
                log(`[TTS] השמעה החלה...`);
                await entersState(player, AudioPlayerStatus.Idle, 20000);
                log(`[TTS] השמעה הסתיימה.`);
            }
        }

        log(`[PODCAST] "צלייה" הסתיימה בהצלחה.`);

    } catch (error) {
        console.error('❌ שגיאה קריטית בתהליך הפודקאסט:', error);
        await sendStaffLog(client, '❌ שגיאת TTS בפודקאסט', `אירעה שגיאה: \`\`\`${error.message}\`\`\``, 0xFF0000);
    } finally {
        log(`[PODCAST] מבצע ניקוי ואיפוס מצב...`);
        await stopPodcast(channel.guild.id);
    }
}

// ✨ --- הוספת הפונקציה החסרה לייצוא ---
module.exports = {
    initializePodcastState,
    handlePodcastTrigger,
    isBotPodcasting
};