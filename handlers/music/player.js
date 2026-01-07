// 📁 handlers/music/player.js
const {
    joinVoiceChannel, createAudioPlayer, createAudioResource, entersState,
    AudioPlayerStatus, VoiceConnectionStatus, NoSubscriberBehavior, StreamType
} = require('@discordjs/voice');
const fs = require('fs');
const { Readable } = require('stream');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log } = require('../../utils/logger');

// הגדרות זמנים (נלקח מהקוד המקורי שלך)
const TIMEOUTS = {
    LONG: 5 * 60 * 1000,  // 5 דקות לשירים
    SHORT: 10 * 1000,     // 10 שניות לסאונדבורד/BF6
    TEST: 1000            // שנייה אחת לטסט
};

const TEST_CHANNEL_ID = '1396779274173943828';
const CONNECTION_STABILIZE_DELAY = 500;

class MusicPlayer {
    
    constructor() {
        this.queues = new Map();
    }

    /**
     * הוספה לתור וניגון
     */
    async addToQueue(guildId, channelId, input, client, type = 'GENERIC', interaction = null, songName = null) {
        const serverQueue = this.getQueue(guildId, client);
        
        // איפוס טיימר ניתוק אם קיים (כי נכנס משהו חדש לתור)
        if (serverQueue.idleTimer) {
            clearTimeout(serverQueue.idleTimer);
            serverQueue.idleTimer = null;
        }
        
        serverQueue.queue.push({ input, type, interaction, songName });
        serverQueue.channelId = channelId;
        serverQueue.lastActivity = Date.now();
        
        if (!serverQueue.isPlaying) this.playNext(guildId);
    }

    /**
     * יצירת/שליפת התור של השרת
     */
    getQueue(guildId, client) {
        if (!this.queues.has(guildId)) {
            const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

            // טיפול באירועי נגן
            player.on(AudioPlayerStatus.Idle, (oldState) => {
                const q = this.queues.get(guildId);
                if (q) {
                    // טיפול בסיום שיר (עדכון הודעה)
                    if (q.lastTrackType === 'SONG' && q.nowPlayingMessage) {
                        this.handleSongEnd(q);
                        q.nowPlayingMessage = null;
                    }
                    
                    // בדיקה אם החיבור נהרס
                    const connectionDestroyed = !q.connection || 
                        q.connection.state.status === VoiceConnectionStatus.Destroyed ||
                        q.connection.state.status === VoiceConnectionStatus.Disconnected;

                    if (oldState.status !== AudioPlayerStatus.Idle && !connectionDestroyed) {
                        q.isPlaying = false;
                        this.playNext(guildId);
                    } else if (connectionDestroyed) {
                        this.destroyQueue(guildId);
                    }
                }
            });

            player.on('error', error => {
                log(`❌ [MusicPlayer] שגיאה בנגן (${guildId}): ${error.message}`);
                const q = this.queues.get(guildId);
                if (q) { q.isPlaying = false; this.playNext(guildId); }
            });
            
            this.queues.set(guildId, {
                queue: [], 
                connection: null, 
                player: player, 
                isPlaying: false,
                channelId: null, 
                client: client,
                lastTrackType: 'GENERIC', 
                nowPlayingMessage: null, 
                idleTimer: null,
                lastActivity: Date.now()
            });
        }
        return this.queues.get(guildId);
    }

    /**
     * ניגון השיר הבא
     */
    async playNext(guildId) {
        const serverQueue = this.queues.get(guildId);
        if (!serverQueue) return;

        // --- סיום התור וניהול זמני יציאה ---
        if (serverQueue.queue.length === 0) {
            serverQueue.isPlaying = false;
            
            let timeoutMs = TIMEOUTS.LONG;
            
            // לוגיקה חכמה לזמני יציאה (לפי הקובץ המקורי)
            if (serverQueue.channelId === TEST_CHANNEL_ID) {
                timeoutMs = TIMEOUTS.TEST;
                log('[Music] ערוץ טסט - יציאה מיידית.');
            } else if (serverQueue.lastTrackType === 'BF6_THEME' || serverQueue.lastTrackType === 'SOUNDBOARD') {
                timeoutMs = TIMEOUTS.SHORT;
            }

            log(`[Music] ⏳ התור ריק בשרת ${guildId}. מתנתק בעוד ${timeoutMs / 1000} שניות.`);
            
            serverQueue.idleTimer = setTimeout(() => {
                const currentQ = this.queues.get(guildId);
                if (currentQ && !currentQ.isPlaying && currentQ.queue.length === 0) {
                    this.destroyQueue(guildId);
                }
            }, timeoutMs);
            return;
        }
        
        serverQueue.isPlaying = true;
        serverQueue.lastActivity = Date.now();
        const track = serverQueue.queue.shift();
        serverQueue.lastTrackType = track.type;
        
        // עדכון הודעה לשיר
        if (track.type === 'SONG' && track.interaction) {
            try {
                serverQueue.nowPlayingMessage = track.interaction.message || await track.interaction.fetchReply();
            } catch (e) {}
        }

        try {
            await this.connectToChannel(serverQueue, guildId, track.type);
            
            const resource = this.createResource(track.input);
            if (!resource) {
                log(`❌ [Music] קובץ פגום או חסר.`);
                serverQueue.isPlaying = false;
                return this.playNext(guildId);
            }

            serverQueue.connection.subscribe(serverQueue.player);
            serverQueue.player.play(resource);
            
            if (track.type === 'SONG') {
                this.updateNowPlaying(serverQueue, track);
            }

        } catch (error) {
            log(`❌ [MusicPlayer] כשל בניגון: ${error.message}`);
            serverQueue.isPlaying = false;
            this.playNext(guildId);
        }
    }

    /**
     * חיבור לערוץ קולי
     */
    async connectToChannel(queue, guildId, type) {
        if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
            const guild = await queue.client.guilds.fetch(guildId);
            const channel = await guild.channels.fetch(queue.channelId);

            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: true,
                selfMute: false
            });

            // הגנה מניתוקים
            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch (error) {
                    this.destroyQueue(guildId);
                }
            });

            connection.on(VoiceConnectionStatus.Destroyed, () => {
                this.destroyQueue(guildId);
            });
            
            queue.connection = connection;
            await entersState(queue.connection, VoiceConnectionStatus.Ready, 30000);
            
            // השהייה קטנה ליציבות (חשוב ל-BF6/Soundboard)
            const delay = (type === 'BF6_THEME' || type === 'SOUNDBOARD') ? 1500 : CONNECTION_STABILIZE_DELAY;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    createResource(input) {
        if (Buffer.isBuffer(input)) return createAudioResource(Readable.from(input));
        if (typeof input === 'string' && fs.existsSync(input)) {
            return createAudioResource(fs.createReadStream(input), { inputType: StreamType.Arbitrary });
        }
        return null;
    }

    destroyQueue(guildId) {
        const q = this.queues.get(guildId);
        if (!q) return;
        
        if (q.idleTimer) clearTimeout(q.idleTimer);
        if (q.player) {
            q.player.stop();
            q.player.removeAllListeners();
        }
        if (q.connection && q.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            q.connection.destroy();
        }
        this.queues.delete(guildId);
        log(`[Music] 🔌 הנגן נותק ונוקה בשרת ${guildId}.`);
    }

    // --- עדכוני UI ---

    async updateNowPlaying(queue, track) {
        if (!queue.nowPlayingMessage) return;
        try {
            const embed = new EmbedBuilder(queue.nowPlayingMessage.embeds[0].data)
                .setTitle('🎶 מתנגן עכשיו')
                .setDescription(`**${track.songName}**`)
                .setColor('Green');
            
            await queue.nowPlayingMessage.edit({ content: '', embeds: [embed], components: [this.getControls(false)] });
        } catch (e) {}
    }

    async handleSongEnd(queue) {
        if (!queue.nowPlayingMessage) return;
        try {
            const embed = new EmbedBuilder(queue.nowPlayingMessage.embeds[0].data)
                .setTitle('⏹️ השיר הסתיים')
                .setColor('Grey');
                
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('new_song').setLabel('🎶 השמע שיר נוסף').setStyle(ButtonStyle.Primary)
            );

            const msg = await queue.nowPlayingMessage.edit({ content: '', embeds: [embed], components: [row] });
            
            // מחיקה אחרי דקה
            setTimeout(() => msg.delete().catch(() => {}), 60000);
        } catch (e) {}
    }

    getControls(isPaused) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(isPaused ? 'resume' : 'pause').setLabel(isPaused ? 'המשך' : 'השהה').setEmoji(isPaused ? '▶️' : '⏸️').setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('stop').setLabel('עצור').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
        );
    }

    // --- שליטה חיצונית ו-Lifecycle ---

    pause(guildId) { 
        const q = this.queues.get(guildId); 
        if(q && q.player && q.player.state.status === AudioPlayerStatus.Playing) {
            q.player.pause(); 
            return true;
        }
        return false;
    }

    resume(guildId) { 
        const q = this.queues.get(guildId); 
        if(q && q.player && q.player.state.status === AudioPlayerStatus.Paused) {
            q.player.unpause(); 
            return true;
        }
        return false;
    }

    stop(guildId) { 
        if (this.queues.has(guildId)) {
            this.destroyQueue(guildId); 
            return true;
        }
        return false;
    }

    // פונקציה לשימוש ב-BotLifecycle לניקוי נגנים תקועים
    checkIdlePlayers() {
        for (const [guildId, queue] of this.queues.entries()) {
            if (queue.queue.length === 0 && queue.player.state.status === AudioPlayerStatus.Idle) {
                 log(`[CRON-Check] מנקה נגן תקוע בשרת ${guildId}`);
                 this.destroyQueue(guildId);
            }
        }
    }
}

module.exports = new MusicPlayer();