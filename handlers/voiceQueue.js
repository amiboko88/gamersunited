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

// המפה שומרת את כל התורים הפעילים, מפתח אחד לכל שרת
const queues = new Map();

/**
 * אחראי על קבלת/יצירת התור עבור שרת.
 * @param {string} guildId
 * @returns {object}
 */
function getQueue(guildId) {
    if (!queues.has(guildId)) {
        // יצירת מבנה תור חדש עם כל מה שצריך
        const queueConstruct = {
            queue: [],
            connection: null,
            player: createAudioPlayer(), // נגן אחד בלבד לכל התור
            isPlaying: false,
            channelId: null,
            client: null,
        };
        queues.set(guildId, queueConstruct);
    }
    return queues.get(guildId);
}

/**
 * מוסיף פריט אודיו לתור של שרת ומפעיל את הנגן אם הוא לא פעיל.
 * @param {string} guildId
 * @param {string} channelId
 * @param {Buffer} audioBuffer
 * @param {import('discord.js').Client} client
 */
function addToQueue(guildId, channelId, audioBuffer, client) {
    const serverQueue = getQueue(guildId);
    serverQueue.queue.push(audioBuffer);
    // שומר את הפרטים החשובים לחיבור במידת הצורך
    serverQueue.channelId = channelId;
    serverQueue.client = client;

    if (!serverQueue.isPlaying) {
        playNextInQueue(guildId);
    }
}

/**
 * הפונקציה המרכזית שמנהלת את ניגון התור.
 * היא מפעילה את עצמה רקורסיבית בסיום כל ניגון.
 * @param {string} guildId
 */
async function playNextInQueue(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return; // הגנה במקרה שהתור נמחק

    // אם התור ריק, סיים את העבודה ונקה הכל
    if (serverQueue.queue.length === 0) {
        logger.info(`[QUEUE] התור הסתיים. מתנתק מערוץ הקול בשרת ${guildId}.`);
        if (serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queues.delete(guildId); // מחיקת התור מהזיכרון
        return;
    }

    // אם כבר משהו מתנגן, אל תפריע
    if (serverQueue.isPlaying) return;

    serverQueue.isPlaying = true;
    const audioBuffer = serverQueue.queue.shift(); // לוקח את הפריט הבא

    try {
        // התחברות לערוץ רק אם אין חיבור פעיל
        if (!serverQueue.connection || serverQueue.connection.state.status === VoiceConnectionStatus.Destroyed) {
            logger.info(`[QUEUE] יוצר חיבור קולי חדש בשרת ${guildId}.`);
            const guild = await serverQueue.client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(serverQueue.channelId);

            serverQueue.connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
            });

            // הרשמה לאירועי ניתוק כדי לנקות את התור במקרה של תקלה
            serverQueue.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(serverQueue.connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(serverQueue.connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                    // התחבר מחדש
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

        // ממתין לסיום הניגון
        await entersState(serverQueue.player, AudioPlayerStatus.Idle, 2 * 60 * 1000); // Timeout של 2 דקות

    } catch (error) {
        logger.error(`❌ [QUEUE] שגיאה קריטית בניגון מהתור בשרת ${guildId}.`, error);
    } finally {
        serverQueue.isPlaying = false;
        // קורא לעצמו כדי לנגן את הפריט הבא או לסיים
        playNextInQueue(guildId);
    }
}

module.exports = {
    addToQueue
};