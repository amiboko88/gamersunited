// 📁 handlers/podcastManager.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { synthesizeElevenTTS } = require('../tts/ttsEngine.elevenlabs');
const { getScriptByUserId, getLineForUser } = require('../data/fifoLines');
const { log } = require('../utils/logger');
const { Readable } = require('stream');
const { Collection } = require('discord.js');
const { sendStaffLog } = require('../utils/staffLogger');

let isPodcastActive = false;
let activePodcastChannelId = null;

const MIN_MEMBERS_FOR_ROAST = 2; // ניתן להעלות חזרה ל-4
const ROAST_COOLDOWN_MS = 30 * 1000; // 30 שניות
const channelRoastCooldowns = new Map();

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
        connection.destroy();
        global.client.voiceConnections.delete(guildId);
        global.client.audioPlayers?.delete(guildId);
        log(`[PODCAST] חיבור קולי נותק משרת ${guildId}.`);
    }
    isPodcastActive = false;
    activePodcastChannelId = null;
}

/**
 * מטפל בלוגיקת הפעלת הפודקאסט (צליה).
 * @param {import('discord.js').VoiceState} newState - המצב הקולי החדש של המשתמש.
 */
async function handlePodcastTrigger(newState) {
    // --- בדיקות הגנה קפדניות ---
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
        log(`[PODCAST] בוטל: הערוץ נמצא ב-cooldown.`);
        return;
    }

    if (memberCount < MIN_MEMBERS_FOR_ROAST) {
        log(`[PODCAST] בוטל: אין מספיק משתמשים (${memberCount}/${MIN_MEMBERS_FOR_ROAST}).`);
        return;
    }

    // --- הפעלת ה-TTS ---
    try {
        isPodcastActive = true;
        activePodcastChannelId = channel.id;
        channelRoastCooldowns.set(channel.id, now);
        log(`[PODCAST] התחלת "צלייה" על ${member.displayName} בערוץ ${channel.name}...`);

        const roastScript = buildRoastScriptForMember(member);
        
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

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
                await entersState(player, AudioPlayerStatus.Idle, 20000);
            }
        }

        log(`[PODCAST] "צלייה" הסתיימה בהצלחה.`);

    } catch (error) {
        console.error('❌ שגיאה קריטית בתהליך הפודקאסט:', error);
        await sendStaffLog(client, '❌ שגיאת TTS בפודקאסט', `אירעה שגיאה: \`\`\`${error.message}\`\`\``, 0xFF0000);
    } finally {
        await stopPodcast(channel.guild.id);
    }
}

module.exports = {
    handlePodcastTrigger,
    isBotPodcasting
};