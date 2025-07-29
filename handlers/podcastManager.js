// 📁 handlers/podcastManager.js

const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, StreamType, VoiceConnectionStatus } = require('@discordjs/voice');
const { synthesizeTTS } = require('../tts/ttsEngine.elevenlabs.js'); // קורא למנוע גוגל החדש
const { getScriptByUserId } = require('../data/fifoLines.js');
const { log } = require('../utils/logger.js');
const { Readable } = require('stream');
const { Collection } = require('discord.js');
const { sendStaffLog } = require('../utils/staffLogger.js');
const { loadBotState, saveBotState } = require('../utils/botStateManager.js');
const dayjs = require('dayjs');

// --- כל המשתנים הגלובליים המקוריים שלך ---
let isPodcastActive = false;
let activePodcastChannelId = null;
let podcastMonitoringEnabled = false;
const MIN_MEMBERS_FOR_ROAST = 4; // תנאי 4 המשתמשים שלך
const ROAST_COOLDOWN_MS = 30 * 1000; // 30 שניות Cooldown
const channelRoastCooldowns = new Map();

// --- כל הפונקציות המקוריות שלך נשמרו ---

function setPodcastMonitoring(isEnabled) {
    podcastMonitoringEnabled = isEnabled;
    const state = { podcastMonitoringEnabled: isEnabled };
    saveBotState('podcastStatus', state);
    log(`[PODCAST_STATE] ניטור הפודקאסטים הוגדר ל: ${isEnabled}`);
}

async function initializePodcastState() {
    log('[PODCAST_STATE] מאתחל מצב פודקאסט...');
    const state = await loadBotState('podcastStatus');
    if (state && typeof state.podcastMonitoringEnabled === 'boolean') {
        podcastMonitoringEnabled = state.podcastMonitoringEnabled;
    } else {
        podcastMonitoringEnabled = false; // ברירת מחדל
    }
    log(`[PODCAST_STATE] ניטור פודקאסטים טעון, המצב הוא: ${podcastMonitoringEnabled}`);
}

function isPodcastActive() { return isPodcastActive; }

function resetPodcast(client) {
    // שימוש ב-client כדי לוודא ניתוק תקין
    if (activePodcastChannelId && client) {
        const guildId = client.channels.cache.get(activePodcastChannelId)?.guild.id;
        if(guildId) {
            const connection = client.voice.adapters.get(guildId);
            if (connection) {
                connection.destroy();
                log('[PODCAST] חיבור קולי אופס ונותק.');
            }
        }
    }
    isPodcastActive = false;
    activePodcastChannelId = null;
    log('[PODCAST] מצב הפודקאסט אופס לחלוטין.');
    return Promise.resolve();
}

// --- פונקציית הטריגר המרכזית, נאמנה למקור ---
async function handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member;
    const channel = newState.channel;
    const client = newState.client;

    if (!podcastMonitoringEnabled || !channel || !member || member.user.bot) return;

    // שימוש ב-dayjs וב-Map לניהול Cooldown
    const now = dayjs();
    const lastRoast = channelRoastCooldowns.get(channel.id);
    if (lastRoast && now.diff(lastRoast, 'millisecond') < ROAST_COOLDOWN_MS) {
        return;
    }

    const membersInChannel = channel.members.filter(m => !m.user.bot);
    if (membersInChannel.size < MIN_MEMBERS_FOR_ROAST) return;

    channelRoastCooldowns.set(channel.id, now);
    log(`[PODCAST] מפעיל "צלייה" בערוץ ${channel.name} עם ${membersInChannel.size} משתמשים.`);
    
    // שימוש ב-sendStaffLog לדיווח
    sendStaffLog(client, `🎙️ פודקאסט התחיל`, `התחיל פודקאסט בערוץ **${channel.name}** עם **${membersInChannel.size}** משתתפים.`);

    let connection;
    try {
        isPodcastActive = true;
        activePodcastChannelId = channel.id;

        const roastScript = await getScriptByUserId(member.id, membersInChannel, member.displayName);

        if (!roastScript || roastScript.length === 0) {
            log('[PODCAST] לא נוצר סקריפט.');
            isPodcastActive = false;
            activePodcastChannelId = null;
            return;
        }

        connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        // שימוש ב-VoiceConnectionStatus לבדיקת חיבור
        await entersState(connection, VoiceConnectionStatus.Ready, 5000);

        const player = createAudioPlayer();
        connection.subscribe(player);

        for (const line of roastScript) {
            if (line.text && line.text.trim()) {
                let profile;
                if (line.speaker === 'שמעון') {
                    const profiles = ['shimon_calm', 'shimon_energetic', 'shimon_serious'];
                    profile = profiles[Math.floor(Math.random() * profiles.length)];
                } else {
                    const profiles = ['shirly_calm', 'shirly_happy', 'shirly_dramatic'];
                    profile = profiles[Math.floor(Math.random() * profiles.length)];
                }

                const audioBuffer = await synthesizeTTS(line.text, profile, member);
                const resource = createAudioResource(Readable.from(audioBuffer), { inputType: StreamType.Arbitrary });
                
                player.play(resource);

                await entersState(player, AudioPlayerStatus.Playing, 5000);
                await entersState(player, AudioPlayerStatus.Idle, 30000);
            }
        }

        log(`[PODCAST] "צלייה" הסתיימה בהצלחה.`);

    } catch (error) {
        log.error('❌ שגיאה קריטית בתהליך הפודקאסט:', error);
        sendStaffLog(client, `🔴 שגיאת פודקאסט`, `אירעה שגיאה:\n\`\`\`${error.message}\`\`\``);
    } finally {
        isPodcastActive = false;
        activePodcastChannelId = null;
        if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
            connection.destroy();
        }
    }
}

module.exports = {
    handleVoiceStateUpdate,
    initializePodcastState,
    setPodcastMonitoring,
    isPodcastActive,
    resetPodcast
};