// 📁 handlers/voiceQueue.js (הנגן המאוחד והמשודרג)
const {
    joinVoiceChannel, createAudioPlayer, createAudioResource, entersState,
    AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior, StreamType
} = require('@discordjs/voice');
const { log } = require('../utils/logger');
const { Readable } = require('stream');
const fs = require('fs');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');

const queues = new Map();
const IDLE_TIMEOUT_MINUTES_LONG = 5; // 5 דקות לפודקאסט/שירים
const IDLE_TIMEOUT_SECONDS_SHORT = 10; // 10 שניות לסאונדבורד/BF6
const TEST_CHANNEL_ID = '1396779274173943828';
const CONNECTION_STABILIZE_DELAY = 500; // חצי שנייה לייצוב
const SONG_END_TIMEOUT_SECONDS = 60; // 60 שניות למחיקת הודעת "שיר נוסף"

/**
 * פונקציית עזר ליצירת AudioResource מכל סוג קלט
 */
function createResource(input) {
    if (Buffer.isBuffer(input)) {
        // עבור Buffers מ-TTS
        return createAudioResource(Readable.from(input));
    }
    if (typeof input === 'string' && fs.existsSync(input)) {
        // עבור נתיבי קבצים (שירים, סאונדבורד)
        return createAudioResource(fs.createReadStream(input), { inputType: StreamType.Arbitrary });
    }
    log(`❌ [QUEUE] קלט לא חוקי ל-createResource: ${typeof input}`);
    return null;
}

function getQueue(guildId, client) {
    if (!queues.has(guildId)) {
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

        player.on(AudioPlayerStatus.Idle, (oldState) => {
            const serverQueue = queues.get(guildId);
            if (!serverQueue) return;

            const connectionDestroyed = !serverQueue.connection || 
                                        serverQueue.connection.state.status === VoiceConnectionStatus.Destroyed ||
                                        serverQueue.connection.state.status === VoiceConnectionStatus.Disconnected;
            
            // ✅ [שדרוג] טיפול בסיום שיר (הצגת כפתור "שיר נוסף")
            if (serverQueue.nowPlayingMessage && serverQueue.lastTrackType === 'SONG') {
                handleSongEnd(serverQueue);
                serverQueue.nowPlayingMessage = null; // אפס את ההודעה
            }

            if (oldState.status !== AudioPlayerStatus.Idle && !connectionDestroyed) {
                serverQueue.isPlaying = false;
                playNextInQueue(guildId);
            } else if (connectionDestroyed) {
                log(`[QUEUE] החיבור נהרס (במהלך Idle), מנקה את התור בשרת ${guildId}.`);
                queues.delete(guildId); // מחיקה מלאה
            }
        });

        player.on('error', error => {
            log(`❌ [PLAYER_ERROR] שגיאה בנגן האודיו בשרת ${guildId}:`, error);
            const serverQueue = queues.get(guildId);
            if (serverQueue) { serverQueue.isPlaying = false; playNextInQueue(guildId); }
        });
        
        const queueConstruct = {
            queue: [], // { input, type, songName, originalInteraction }
            connection: null, 
            player: player, 
            isPlaying: false,
            channelId: null, 
            client: client, 
            lastActivity: Date.now(),
            lastTrackType: 'GENERIC', 
            nowPlayingMessage: null, // הודעת הנגן הנוכחית (לעריכה)
            idleTimer: null 
        };
        queues.set(guildId, queueConstruct);
    }
    return queues.get(guildId);
}

/**
 * @param {string} guildId 
 * @param {string} channelId 
 * @param {Buffer | string} input - Buffer (TTS) או string (נתיב קובץ)
 * @param {import('discord.js').Client} client 
 * @param {'PODCAST' | 'BF6_THEME' | 'SOUNDBOARD' | 'SONG'} type 
 * @param {import('discord.js').ChatInputCommandInteraction | null} interaction - האינטראקציה המקורית (אופציונלי)
 * @param {string | null} songName - שם השיר (אופציונלי)
 */
function addToQueue(guildId, channelId, input, client, type = 'GENERIC', interaction = null, songName = null) {
    const serverQueue = getQueue(guildId, client);
    
    if (serverQueue.idleTimer) {
        clearTimeout(serverQueue.idleTimer);
        serverQueue.idleTimer = null;
    }
    
    serverQueue.queue.push({ input, type, interaction, songName });
    serverQueue.channelId = channelId;
    serverQueue.lastActivity = Date.now();
    if (!serverQueue.isPlaying) playNextInQueue(guildId);
}

async function playNextInQueue(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || serverQueue.isPlaying || serverQueue.queue.length === 0) {
        // --- התור ריק ---
        if (serverQueue && serverQueue.queue.length === 0 && !serverQueue.isPlaying) {
            serverQueue.lastActivity = Date.now();
            log(`[QUEUE] התור הסתיים בשרת ${guildId}.`);
            
            // ✅ [שדרוג] לוגיקת ניתוק חכמה
            let timeoutSeconds;
            if (serverQueue.channelId === TEST_CHANNEL_ID) {
                timeoutSeconds = 1; 
                log('[QUEUE] מזהה ערוץ טסט. מתנתק תוך שנייה.');
            } else if (serverQueue.lastTrackType === 'BF6_THEME' || serverQueue.lastTrackType === 'SOUNDBOARD') {
                timeoutSeconds = IDLE_TIMEOUT_SECONDS_SHORT; 
                log(`[QUEUE] סאונד קצר הסתיים. מתנתק תוך ${timeoutSeconds} שניות.`);
            } else if (serverQueue.lastTrackType === 'SONG') {
                // אם השיר האחרון היה שיר, אל תתנתק. הטיימר מנוהל ע"י handleSongEnd
                return;
            } else {
                timeoutSeconds = IDLE_TIMEOUT_MINUTES_LONG * 60; 
                log(`[QUEUE] סאונד ארוך הסתיים. מתנתק תוך ${IDLE_TIMEOUT_MINUTES_LONG} דקות.`);
            }

            if (serverQueue.idleTimer) clearTimeout(serverQueue.idleTimer);
            serverQueue.idleTimer = setTimeout(() => {
                const currentQueue = queues.get(guildId);
                if (currentQueue && !currentQueue.isPlaying && currentQueue.queue.length === 0) {
                    log(`[CLEANUP] טיימר הניתוק (${timeoutSeconds} שניות) הופעל. מנתק משרת ${guildId}.`);
                    if (currentQueue.connection && currentQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                        currentQueue.connection.destroy();
                    }
                    if (currentQueue.player) currentQueue.player.stop();
                    queues.delete(guildId);
                }
            }, timeoutSeconds * 1000);
        }
        return;
    }
    
    // --- יש פריטים בתור ---
    serverQueue.isPlaying = true;
    serverQueue.lastActivity = Date.now();
    
    const { input, type, interaction, songName } = serverQueue.queue.shift();
    serverQueue.lastTrackType = type;
    
    // ✅ [שדרוג] שמירת ההודעה שצריך לערוך
    if (type === 'SONG' && interaction) {
        serverQueue.nowPlayingMessage = interaction.message || await interaction.fetchReply();
    }

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
            
            connection.on(VoiceConnectionStatus.Destroyed, () => {
                log(`[QUEUE] החיבור בשרת ${guildId} נהרס (ניתוק ידני?). מנקה את התור.`);
                if (queues.has(guildId)) {
                    queues.delete(guildId); // מחיקה מלאה
                }
            });

            serverQueue.connection = connection;
            await entersState(serverQueue.connection, VoiceConnectionStatus.Ready, 30_000);
            
            // ✅ [תיקון חיתוך סאונד] הוספת השהייה קטנה לייצוב
            await new Promise(resolve => setTimeout(resolve, CONNECTION_STABILIZE_DELAY));
        }
        
        const resource = createResource(input);
        if (!resource) {
            log(`❌ [QUEUE] נכשל ביצירת AudioResource.`);
            serverQueue.isPlaying = false;
            return playNextInQueue(guildId);
        }

        serverQueue.connection.subscribe(serverQueue.player);
        serverQueue.player.play(resource);
        log(`[QUEUE] 🎵 מנגן (${type}) קטע שמע חדש בשרת ${guildId}.`);
        
        // ✅ [שדרוג] עדכון הודעת "מתנגן עכשיו"
        if (type === 'SONG' && serverQueue.nowPlayingMessage) {
            const embed = new EmbedBuilder(serverQueue.nowPlayingMessage.embeds[0].data)
                .setTitle('🎶 מתנגן עכשיו')
                .setDescription(`**${songName}**`);
            const row = getMusicButtons(false); // כפתורים (עם Pause)
            await serverQueue.nowPlayingMessage.edit({ content: '', embeds: [embed], components: [row] });
        }

    } catch (error) {
        log(`❌ [QUEUE] שגיאה קריטית בתהליך הניגון בשרת ${guildId}:`, error);
        serverQueue.isPlaying = false;
        playNextInQueue(guildId); 
    }
}

/**
 * מחזיר שורת כפתורים (Play/Pause)
 * @param {boolean} isPaused - האם הנגן במצב מושהה?
 */
function getMusicButtons(isPaused = false) {
  return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
          .setCustomId(isPaused ? 'resume' : 'pause')
          .setLabel(isPaused ? 'המשך' : 'השהה')
          .setEmoji(isPaused ? '▶️' : '⏸️')
          .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
          .setCustomId('stop')
          .setLabel('עצור')
          .setEmoji('⏹️')
          .setStyle(ButtonStyle.Danger)
  );
}

/**
 * טיפול בסיום שיר (מחליף כפתורים ומתחיל טיימר מחיקה)
 */
async function handleSongEnd(serverQueue) {
    if (!serverQueue.nowPlayingMessage) return;

    const endEmbed = new EmbedBuilder(serverQueue.nowPlayingMessage.embeds[0].data)
        .setTitle('🎵 השיר הסתיים');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('new_song')
            .setLabel('🎶 השמע שיר נוסף')
            .setStyle(ButtonStyle.Primary)
    );

    try {
        const msg = await serverQueue.nowPlayingMessage.edit({
            content: '',
            embeds: [endEmbed],
            components: [row]
        });

        // מתחיל טיימר של דקה למחיקה (כפי שביקשת)
        setTimeout(async () => {
            await msg.delete().catch(() => {});
        }, SONG_END_TIMEOUT_SECONDS * 1000);

    } catch (error) {
        if (error.code !== 10008) { // התעלם אם ההודעה כבר נמחקה
            log(`❌ [QUEUE] שגיאה בעריכת הודעת סיום שיר:`, error);
        }
    }
}

// --- פונקציות שליטה (עבור הכפתורים) ---
function pause(guildId) {
    const serverQueue = queues.get(guildId);
    if (serverQueue && serverQueue.isPlaying && serverQueue.player.state.status === AudioPlayerStatus.Playing) {
        serverQueue.player.pause();
        return true;
    }
    return false;
}

function resume(guildId) {
    const serverQueue = queues.get(guildId);
    if (serverQueue && serverQueue.player.state.status === AudioPlayerStatus.Paused) {
        serverQueue.player.unpause();
        return true;
    }
    return false;
}

function stop(guildId) {
    const serverQueue = queues.get(guildId);
    if (serverQueue) {
        serverQueue.queue = []; 
        if (serverQueue.player) serverQueue.player.stop(); 
        
        // ✅ [שדרוג] מוחק את הודעת הנגן
        if (serverQueue.nowPlayingMessage) {
            serverQueue.nowPlayingMessage.delete().catch(() => {});
            serverQueue.nowPlayingMessage = null;
        }
        
        // הניתוק יטופל ע"י טיימר ה-Idle הקצר
        return true;
    }
    return false;
}

/**
 * פונקציה לעריכת הודעת השיר המקורי.
 * @param {string} guildId
 * @param {string} content 
 * @param {boolean} isPaused 
 */
async function updateSongMessage(guildId, content, isPaused) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || !serverQueue.nowPlayingMessage) return;

    try {
        const embed = new EmbedBuilder(serverQueue.nowPlayingMessage.embeds[0].data);
        const row = getMusicButtons(isPaused); // קבל כפתורים מעודכנים (Play/Pause)
        
        // ✅ [שדרוג] מעדכן את תוכן ההודעה שמעל ה-Embed
        await serverQueue.nowPlayingMessage.edit({ 
            content: `*${content}*`,
            embeds: [embed], 
            components: [row]
        });
    } catch (error) {
        if (error.code !== 10008) { 
            log(`❌ [QUEUE] שגיאה בעדכון הודעת שיר:`, error);
        }
    }
}

function cleanupIdleConnections() {
    // הלוגיקה הועברה לטיימר הפנימי ב-playNextInQueue.
}

module.exports = { 
    addToQueue, 
    cleanupIdleConnections,
    pause,
    resume,
    stop,
    updateSongMessage,
    getQueue // חשיפה עבור musicControls
};