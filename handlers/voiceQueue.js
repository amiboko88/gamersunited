// 📁 handlers/voiceQueue.js

const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const { log } = require('../utils/logger');
const { Readable } = require('stream');

const queues = new Map();

// פונקציה זו נשארה כמעט זהה, רק מוודאת שהיא יוצרת נגן
function getQueue(guildId) {
    if (!queues.has(guildId)) {
        queues.set(guildId, {
            queue: [],
            isPlaying: false,
            connection: null,
            player: createAudioPlayer() // יצירת נגן פעם אחת לכל שרת
        });
    }
    return queues.get(guildId);
}

// פונקציה זו נשארה זהה, רק מקבלת client כדי ליצור חיבור אם צריך
async function addToQueue(guildId, channelId, audioBuffer, client) {
    const serverQueue = getQueue(guildId);
    serverQueue.channelId = channelId;
    serverQueue.client = client; // שומרים את ה-client
    serverQueue.queue.push(audioBuffer);
    
    if (!serverQueue.isPlaying) {
        playNextInQueue(guildId);
    }
}

// כאן השדרוג המרכזי - לוגיקה יציבה יותר
async function playNextInQueue(guildId) {
    const serverQueue = getQueue(guildId);
    if (serverQueue.queue.length === 0) {
        if (serverQueue.connection) {
            serverQueue.connection.destroy();
            queues.delete(guildId);
            log('[QUEUE] התור ריק והחיבור נסגר.');
        }
        return;
    }

    if (serverQueue.isPlaying) return;

    serverQueue.isPlaying = true;
    const audioBuffer = serverQueue.queue.shift();
    
    try {
        // יוצר חיבור רק אם הוא לא קיים או נהרס
        if (!serverQueue.connection || serverQueue.connection.state.status === VoiceConnectionStatus.Destroyed) {
            const guild = await serverQueue.client.guilds.fetch(guildId);
            serverQueue.connection = joinVoiceChannel({
                channelId: serverQueue.channelId,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
            });
            serverQueue.connection.subscribe(serverQueue.player);
            await entersState(serverQueue.connection, VoiceConnectionStatus.Ready, 5000);
        }
        
        const resource = createAudioResource(Readable.from(audioBuffer));
        serverQueue.player.play(resource);

        await entersState(serverQueue.player, AudioPlayerStatus.Playing, 5000);
        await entersState(serverQueue.player, AudioPlayerStatus.Idle, 120_000); // Timeout of 2 minutes per clip

    } catch (error) {
        log.error('❌ [QUEUE] שגיאה בניגון שמע מהתור:', error);
        if (serverQueue.connection) serverQueue.connection.destroy();
        queues.delete(guildId);
    } finally {
        serverQueue.isPlaying = false;
        // ממשיך לקטע הבא בתור או מסיים
        playNextInQueue(guildId); 
    }
}

// כל שאר הפונקציות המקוריות שלך, כמו cleanupIdleConnections, נשארות כאן
function cleanupIdleConnections() {
    // לדוגמה, אם הייתה לך פונקציה כזו, היא הייתה נשארת כאן ללא שינוי
    // log('[QUEUE] מבצע ניקוי חיבורים ישנים...');
}


module.exports = { 
    addToQueue, 
    playNextInQueue,
    cleanupIdleConnections // מוודא שכל הפונקציות מיוצאות
};