// 📁 handlers/voiceQueue.js (מתוקן עם ניקוי תור ב-Destroy)
const {
    joinVoiceChannel, createAudioPlayer, createAudioResource, entersState,
    AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior
} = require('@discordjs/voice');
const { log } = require('../utils/logger');
const { Readable } = require('stream');

const queues = new Map();
const IDLE_TIMEOUT_MINUTES = 5;

function getQueue(guildId, client) {
    if (!queues.has(guildId)) {
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

        player.on(AudioPlayerStatus.Idle, (oldState) => {
            const serverQueue = queues.get(guildId);
            if (serverQueue && oldState.status !== AudioPlayerStatus.Idle) {
                serverQueue.isPlaying = false;
                playNextInQueue(guildId);
            }
        });

        player.on('error', error => {
            log(`❌ [PLAYER_ERROR] שגיאה בנגן האודיו בשרת ${guildId}:`, error);
            const serverQueue = queues.get(guildId);
            if (serverQueue) { serverQueue.isPlaying = false; playNextInQueue(guildId); }
        });
        
        const queueConstruct = {
            queue: [], connection: null, player: player, isPlaying: false,
            channelId: null, client: client, lastActivity: Date.now(),
        };
        queues.set(guildId, queueConstruct);
    }
    return queues.get(guildId);
}

function addToQueue(guildId, channelId, audioBuffer, client) {
    const serverQueue = getQueue(guildId, client);
    serverQueue.queue.push(audioBuffer);
    serverQueue.channelId = channelId;
    serverQueue.lastActivity = Date.now();
    if (!serverQueue.isPlaying) playNextInQueue(guildId);
}

async function playNextInQueue(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || serverQueue.isPlaying || serverQueue.queue.length === 0) {
        if (serverQueue && serverQueue.queue.length === 0) {
            serverQueue.isPlaying = false;
            serverQueue.lastActivity = Date.now();
            log(`[QUEUE] התור הסתיים בשרת ${guildId}.`);
        }
        return;
    }

    serverQueue.isPlaying = true;
    serverQueue.lastActivity = Date.now();
    const audioBuffer = serverQueue.queue.shift();

    try {
        if (!serverQueue.connection || serverQueue.connection.state.status === VoiceConnectionStatus.Destroyed) {
            const guild = await serverQueue.client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(serverQueue.channelId);

            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true, 
                selfMute: false
            });
            
            // ✅ [תיקון באג ה-Stuck] מוסיפים האזנה להרס החיבור
            connection.on(VoiceConnectionStatus.Destroyed, () => {
                log(`[QUEUE] החיבור בשרת ${guildId} נהרס (ניתוק ידני?). מנקה את התור.`);
                if (serverQueue) {
                    serverQueue.queue = []; // מרוקן את התור
                    serverQueue.isPlaying = false;
                    if (serverQueue.connection) serverQueue.connection = null;
                }
            });

            serverQueue.connection = connection;
            await entersState(serverQueue.connection, VoiceConnectionStatus.Ready, 30_000);
        }
        
        serverQueue.connection.subscribe(serverQueue.player);
        const resource = createAudioResource(Readable.from(audioBuffer));
        serverQueue.player.play(resource);
        log(`[QUEUE] 🎵 מנגן קטע שמע חדש בשרת ${guildId}.`);

    } catch (error) {
        log(`❌ [QUEUE] שגיאה קריטית בתהליך הניגון בשרת ${guildId}:`, error);
        serverQueue.isPlaying = false;
        playNextInQueue(guildId);
    }
}

function cleanupIdleConnections() {
    const now = Date.now();
    for (const [guildId, serverQueue] of queues.entries()) {
        const idleTime = now - serverQueue.lastActivity;
        if (!serverQueue.isPlaying && serverQueue.queue.length === 0 && idleTime > IDLE_TIMEOUT_MINUTES * 60 * 1000) {
            log(`[CLEANUP] מנתק חיבור לא פעיל בשרת ${guildId}.`);
            
            // ✅ [תיקון באג ה-Cron] בודק שהחיבור קיים ועדיין לא הושמד
            if (serverQueue.connection && serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                serverQueue.connection.destroy();
            }
            if (serverQueue.player) serverQueue.player.stop();
            queues.delete(guildId);
        }
    }
}

module.exports = { addToQueue, cleanupIdleConnections };