// 📁 handlers/voiceQueue.js
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    AudioPlayerStatus,
    VoiceConnectionStatus
} = require('@discordjs/voice');
const logger = require('../utils/logger');
const { Readable } = require('stream');

const queues = new Map();
const IDLE_TIMEOUT_MINUTES = 5; // זמן בחוסר פעילות בדקות לפני ניתוק

/**
 * אחראי על קבלת/יצירת התור עבור שרת.
 */
function getQueue(guildId) {
    if (!queues.has(guildId)) {
        const queueConstruct = {
            queue: [],
            connection: null,
            player: createAudioPlayer(),
            isPlaying: false,
            channelId: null,
            client: null,
            lastActivity: Date.now(), // ✅ [תיקון] הוספת מעקב אחר פעילות
        };
        queues.set(guildId, queueConstruct);
    }
    return queues.get(guildId);
}

/**
 * מוסיף פריט אודיו לתור של שרת ומפעיל את הנגן אם הוא לא פעיל.
 */
function addToQueue(guildId, channelId, audioBuffer, client) {
    const serverQueue = getQueue(guildId);
    serverQueue.queue.push(audioBuffer);
    serverQueue.channelId = channelId;
    serverQueue.client = client;
    serverQueue.lastActivity = Date.now(); // ✅ [תיקון] עדכון פעילות אחרונה

    if (!serverQueue.isPlaying) {
        playNextInQueue(guildId);
    }
}

/**
 * הפונקציה המרכזית שמנהלת את ניגון התור.
 */
async function playNextInQueue(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return;

    if (serverQueue.queue.length === 0) {
        serverQueue.isPlaying = false;
        serverQueue.lastActivity = Date.now(); // ✅ [תיקון] עדכון פעילות גם כשהתור מתרוקן
        logger.info(`[QUEUE] התור הסתיים בשרת ${guildId}. הבוט ממתין בחוסר פעילות.`);
        // הבוט לא מתנתק מיידית, הפונקציה cleanupIdleConnections תטפל בזה
        return;
    }

    if (serverQueue.isPlaying) return;

    serverQueue.isPlaying = true;
    serverQueue.lastActivity = Date.now(); // ✅ [תיקון] עדכון פעילות לפני ניגון
    const audioBuffer = serverQueue.queue.shift();

    try {
        if (!serverQueue.connection || serverQueue.connection.state.status === VoiceConnectionStatus.Destroyed) {
            logger.info(`[QUEUE] יוצר חיבור קולי חדש בשרת ${guildId}.`);
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
                    logger.warn(`[QUEUE] החיבור נותק ולא הצליח להתחבר מחדש בשרת ${guildId}. מנקה את התור.`);
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
        logger.error(`❌ [QUEUE] שגיאה קריטית בניגון מהתור בשרת ${guildId}.`, error);
    } finally {
        serverQueue.isPlaying = false;
        playNextInQueue(guildId);
    }
}

// --- ✅ [תיקון] מימוש הפונקציה החסרה ---
/**
 * פונקציה שנקראת על ידי ה-CRON כדי לנקות חיבורים לא פעילים.
 */
function cleanupIdleConnections() {
    const now = Date.now();
    logger.info('[CRON] מבצע בדיקת חיבורי קול לא פעילים...');
    for (const [guildId, serverQueue] of queues.entries()) {
        const idleTime = now - serverQueue.lastActivity;
        if (!serverQueue.isPlaying && serverQueue.queue.length === 0 && idleTime > IDLE_TIMEOUT_MINUTES * 60 * 1000) {
            logger.info(`[CLEANUP] מנתק חיבור לא פעיל בשרת ${guildId} לאחר ${IDLE_TIMEOUT_MINUTES} דקות.`);
            if (serverQueue.connection) {
                serverQueue.connection.destroy();
            }
            queues.delete(guildId);
        }
    }
}
// ---------------------------------------------

// --- ✅ [תיקון] הוספת הפונקציה לייצוא ---
module.exports = {
    addToQueue,
    cleanupIdleConnections // הפונקציה זמינה כעת עבור ה-CRON
};