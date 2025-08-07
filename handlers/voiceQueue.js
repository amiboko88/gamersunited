// 📁 handlers/voiceQueue.js
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    AudioPlayerStatus,
    VoiceConnectionStatus
} = require('@discordjs/voice');
const { log } = require('../utils/logger');
const { Readable } = require('stream');

const queues = new Map();
const IDLE_TIMEOUT_MINUTES = 5;

function getQueue(guildId) {
    if (!queues.has(guildId)) {
        const queueConstruct = {
            queue: [],
            connection: null,
            player: createAudioPlayer(),
            isPlaying: false,
            channelId: null,
            client: null,
            lastActivity: Date.now(),
        };
        queues.set(guildId, queueConstruct);
    }
    return queues.get(guildId);
}

function addToQueue(guildId, channelId, audioBuffer, client) {
    const serverQueue = getQueue(guildId);
    serverQueue.queue.push(audioBuffer);
    serverQueue.channelId = channelId;
    serverQueue.client = client;
    serverQueue.lastActivity = Date.now();

    if (!serverQueue.isPlaying) {
        playNextInQueue(guildId);
    }
}

async function playNextInQueue(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return;

    if (serverQueue.queue.length === 0) {
        serverQueue.isPlaying = false;
        serverQueue.lastActivity = Date.now();
        log(`[QUEUE] התור הסתיים בשרת ${guildId}. הבוט ממתין בחוסר פעילות.`);
        return;
    }

    if (serverQueue.isPlaying) return;

    serverQueue.isPlaying = true;
    serverQueue.lastActivity = Date.now();
    const audioBuffer = serverQueue.queue.shift();

    try {
        if (!serverQueue.connection || serverQueue.connection.state.status === VoiceConnectionStatus.Destroyed) {
            log(`[QUEUE] יוצר חיבור קולי חדש בשרת ${guildId}.`);
            const guild = await serverQueue.client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(serverQueue.channelId);

            serverQueue.connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
            });

            serverQueue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(serverQueue.connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(serverQueue.connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
                    log(`⚠️ [QUEUE] החיבור נותק ולא הצליח להתחבר מחדש בשרת ${guildId}. מנקה את התור.`);
                    if(serverQueue.connection) serverQueue.connection.destroy();
                    queues.delete(guildId);
                }
            });

            serverQueue.connection.subscribe(serverQueue.player);
        }

        const resource = createAudioResource(Readable.from(audioBuffer));
        serverQueue.player.play(resource);

        await entersState(serverQueue.player, AudioPlayerStatus.Idle, 2 * 60 * 1000);

    } catch (error) {
        log(`❌ [QUEUE] שגיאה קריטית בניגון מהתור בשרת ${guildId}.`, error);
    } finally {
        serverQueue.isPlaying = false;
        playNextInQueue(guildId);
    }
}

/**
 * פונקציה שנקראת על ידי ה-CRON כדי לנקות חיבורים לא פעילים.
 */
function cleanupIdleConnections() {
    const now = Date.now();
    // --- ✅ [תיקון] הוסרה שורת הלוג הרועשת ---
    for (const [guildId, serverQueue] of queues.entries()) {
        const idleTime = now - serverQueue.lastActivity;
        if (!serverQueue.isPlaying && serverQueue.queue.length === 0 && idleTime > IDLE_TIMEOUT_MINUTES * 60 * 1000) {
            log(`[CLEANUP] מנתק חיבור לא פעיל בשרת ${guildId} לאחר ${IDLE_TIMEOUT_MINUTES} דקות.`);
            if (serverQueue.connection) {
                serverQueue.connection.destroy();
            }
            queues.delete(guildId);
        }
    }
}

module.exports = {
    addToQueue,
    cleanupIdleConnections
};