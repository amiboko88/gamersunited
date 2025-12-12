// 📁 handlers/voiceQueue.js (מתוקן למניעת קיפאון)
const {
    joinVoiceChannel, createAudioPlayer, createAudioResource, entersState,
    AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior, StreamType
} = require('@discordjs/voice');
const { log } = require('../utils/logger');
const { Readable } = require('stream');
const fs = require('fs');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const queues = new Map();
const IDLE_TIMEOUT_MINUTES_LONG = 5; 
const IDLE_TIMEOUT_SECONDS_SHORT = 10;
const TEST_CHANNEL_ID = '1396779274173943828';
const CONNECTION_STABILIZE_DELAY = 500; 
const SONG_END_TIMEOUT_SECONDS = 60; 

function createResource(input) {
    if (Buffer.isBuffer(input)) {
        return createAudioResource(Readable.from(input));
    }
    if (typeof input === 'string' && fs.existsSync(input)) {
        return createAudioResource(fs.createReadStream(input), { inputType: StreamType.Arbitrary });
    }
    log(`❌ [QUEUE] קלט לא חוקי ל-createResource: ${typeof input}`);
    return null;
}

/**
 * ✅ [תיקון קריטי] פונקציה מרכזית להריסת תור וניקוי משאבים
 * מונעת דליפות זיכרון וקיפאון
 */
function destroyQueue(guildId) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue) return;

    log(`[QUEUE] הורס ומנקה את התור בשרת ${guildId} למניעת קיפאון.`);

    // 1. עצירת טיימרים
    if (serverQueue.idleTimer) clearTimeout(serverQueue.idleTimer);

    // 2. עצירת הנגן
    if (serverQueue.player) {
        serverQueue.player.stop();
        serverQueue.player.removeAllListeners(); // ניקוי מאזינים למניעת כפילויות
    }

    // 3. ניתוק החיבור (אם קיים)
    if (serverQueue.connection) {
        if (serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            serverQueue.connection.destroy();
        }
        serverQueue.connection.removeAllListeners(); // ניקוי מאזינים
    }

    // 4. מחיקה מהמפה
    queues.delete(guildId);
}

function getQueue(guildId, client) {
    if (!queues.has(guildId)) {
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

        // --- מאזיני נגן ---
        player.on(AudioPlayerStatus.Idle, (oldState) => {
            const serverQueue = queues.get(guildId);
            if (!serverQueue) return;

            // בדיקת שלמות החיבור
            const connectionDestroyed = !serverQueue.connection || 
                                        serverQueue.connection.state.status === VoiceConnectionStatus.Destroyed ||
                                        serverQueue.connection.state.status === VoiceConnectionStatus.Disconnected;
            
            // טיפול בסיום שיר
            if (serverQueue.nowPlayingMessage && serverQueue.lastTrackType === 'SONG') {
                handleSongEnd(serverQueue);
                serverQueue.nowPlayingMessage = null; 
            }

            if (oldState.status !== AudioPlayerStatus.Idle && !connectionDestroyed) {
                serverQueue.isPlaying = false;
                playNextInQueue(guildId);
            } else if (connectionDestroyed) {
                log(`[QUEUE] החיבור נהרס (במהלך Idle).`);
                destroyQueue(guildId); // ✅ שימוש בפונקציית ההריסה
            }
        });

        player.on('error', error => {
            log(`❌ [PLAYER_ERROR] שגיאה בנגן האודיו בשרת ${guildId}:`, error);
            const serverQueue = queues.get(guildId);
            if (serverQueue) { serverQueue.isPlaying = false; playNextInQueue(guildId); }
        });
        
        const queueConstruct = {
            queue: [], 
            connection: null, 
            player: player, 
            isPlaying: false,
            channelId: null, 
            client: client, 
            lastActivity: Date.now(),
            lastTrackType: 'GENERIC', 
            nowPlayingMessage: null, 
            idleTimer: null 
        };
        queues.set(guildId, queueConstruct);
    }
    return queues.get(guildId);
}

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
        if (serverQueue && serverQueue.queue.length === 0 && !serverQueue.isPlaying) {
            serverQueue.lastActivity = Date.now();
            log(`[QUEUE] התור הסתיים בשרת ${guildId}.`);
            
            let timeoutSeconds;
            if (serverQueue.channelId === TEST_CHANNEL_ID) {
                timeoutSeconds = 1; 
                log('[QUEUE] מזהה ערוץ טסט. מתנתק תוך שנייה.');
            } else if (serverQueue.lastTrackType === 'BF6_THEME' || serverQueue.lastTrackType === 'SOUNDBOARD') {
                timeoutSeconds = IDLE_TIMEOUT_SECONDS_SHORT; 
                log(`[QUEUE] סאונד קצר הסתיים. מתנתק תוך ${timeoutSeconds} שניות.`);
            } else if (serverQueue.lastTrackType === 'SONG') {
                return;
            } else {
                timeoutSeconds = IDLE_TIMEOUT_MINUTES_LONG * 60; 
                log(`[QUEUE] סאונד ארוך הסתיים. מתנתק תוך ${IDLE_TIMEOUT_MINUTES_LONG} דקות.`);
            }

            if (serverQueue.idleTimer) clearTimeout(serverQueue.idleTimer);
            serverQueue.idleTimer = setTimeout(() => {
                const currentQueue = queues.get(guildId);
                // בדיקה כפולה לפני ניתוק
                if (currentQueue && !currentQueue.isPlaying && currentQueue.queue.length === 0) {
                    log(`[CLEANUP] טיימר הניתוק (${timeoutSeconds} שניות) הופעל.`);
                    destroyQueue(guildId); // ✅ שימוש בפונקציית ההריסה
                }
            }, timeoutSeconds * 1000);
        }
        return;
    }
    
    serverQueue.isPlaying = true;
    serverQueue.lastActivity = Date.now();
    
    const { input, type, interaction, songName } = serverQueue.queue.shift();
    serverQueue.lastTrackType = type;
    
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
            
            // --- מאזיני חיבור ---
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                    // התחבר מחדש
                } catch (error) {
                    log(`[QUEUE] החיבור התנתק סופית.`);
                    destroyQueue(guildId); // ✅ שימוש בפונקציית ההריסה
                }
            });

            connection.on(VoiceConnectionStatus.Destroyed, () => {
                log(`[QUEUE] החיבור נהרס (אירוע Destroyed).`);
                destroyQueue(guildId); // ✅ שימוש בפונקציית ההריסה
            });

            serverQueue.connection = connection;
            await entersState(serverQueue.connection, VoiceConnectionStatus.Ready, 30_000);
            
            if (type === 'BF6_THEME' || type === 'SOUNDBOARD') {
                await new Promise(resolve => setTimeout(resolve, 1500)); 
            } else {
                await new Promise(resolve => setTimeout(resolve, CONNECTION_STABILIZE_DELAY)); 
            }
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
        
        if (type === 'SONG' && serverQueue.nowPlayingMessage) {
            const embed = new EmbedBuilder(serverQueue.nowPlayingMessage.embeds[0].data)
                .setTitle('🎶 מתנגן עכשיו')
                .setDescription(`**${songName}**`);
            const row = getMusicButtons(false); 
            await serverQueue.nowPlayingMessage.edit({ content: '', embeds: [embed], components: [row] });
        }

    } catch (error) {
        log(`❌ [QUEUE] שגיאה קריטית בתהליך הניגון בשרת ${guildId}:`, error);
        serverQueue.isPlaying = false;
        playNextInQueue(guildId); 
    }
}

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

        setTimeout(async () => {
            await msg.delete().catch(() => {});
        }, SONG_END_TIMEOUT_SECONDS * 1000);

    } catch (error) {
        if (error.code !== 10008) { 
            log(`❌ [QUEUE] שגיאה בעריכת הודעת סיום שיר:`, error);
        }
    }
}

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
    // ✅ [תיקון] שימוש בפונקציית ההריסה גם לעצירה יזומה
    const serverQueue = queues.get(guildId);
    if (serverQueue) {
        if (serverQueue.nowPlayingMessage) {
            serverQueue.nowPlayingMessage.delete().catch(() => {});
            serverQueue.nowPlayingMessage = null;
        }
        destroyQueue(guildId);
        return true;
    }
    return false;
}

async function updateSongMessage(guildId, content, isPaused) {
    const serverQueue = queues.get(guildId);
    if (!serverQueue || !serverQueue.nowPlayingMessage) return;

    try {
        const embed = new EmbedBuilder(serverQueue.nowPlayingMessage.embeds[0].data);
        const row = getMusicButtons(isPaused); 
        
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

function cleanupIdleConnections() {}

module.exports = { 
    addToQueue, 
    cleanupIdleConnections,
    pause,
    resume,
    stop,
    updateSongMessage,
    getQueue 
};