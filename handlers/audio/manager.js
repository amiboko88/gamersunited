// 📁 handlers/audio/manager.js
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    StreamType
} = require('@discordjs/voice');
const { log } = require('../../utils/logger');
const fs = require('fs');

class AudioManager {
    constructor() {
        this.connection = null;
        this.musicPlayer = createAudioPlayer();
        this.effectPlayer = createAudioPlayer(); // שחקן נפרד לאפקטים

        this.currentTrack = null;
        this.isLooping = false;

        this.setupListeners();
    }

    setupListeners() {
        // --- מוזיקה ---
        this.musicPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.isLooping && this.currentTrack) {
                this.playTrack(this.currentTrack.path, this.currentTrack.name);
            } else {
                this.currentTrack = null;
            }
        });

        this.musicPlayer.on('error', error => {
            log(`❌ [MusicPlayer Error] ${error.message}`);
        });

        // --- אפקטים ---
        this.effectPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.connection && this.currentTrack) {
                this.connection.subscribe(this.musicPlayer);
                this.musicPlayer.unpause();
            }
        });

        this.effectPlayer.on('error', error => {
            log(`❌ [EffectPlayer Error] ${error.message}`);
        });
    }

    async joinChannel(channel) {
        if (!channel) return false;

        try {
            this.connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });

            await entersState(this.connection, VoiceConnectionStatus.Ready, 10000); // Increased to 10s
            this.connection.subscribe(this.musicPlayer);
            return true;
        } catch (error) {
            log(`❌ [AudioManager] Join Error: ${error.message}`);
            return false;
        }
    }

    /**
     * ✅ פונקציה חדשה: מנגנת קובץ מקומי ומחברת את הבוט אם צריך
     */
    async playLocalFile(guildId, channelId, filePath) {
        try {
            // Check if connection is valid and ready
            const isDisconnected = this.connection &&
                (this.connection.state.status === VoiceConnectionStatus.Disconnected ||
                    this.connection.state.status === VoiceConnectionStatus.Destroyed);

            // אם לא מחובר, מחובר לערוץ אחר, או שהחיבור נותק - מתחבר מחדש
            if (!this.connection || this.connection.joinConfig.channelId !== channelId || isDisconnected) {
                log(`🔊 [AudioManager] Connecting to channel ${channelId} (Status: ${this.connection?.state?.status || 'None'})...`);
                const { client } = require('../../discord/index');
                const guild = await client?.guilds.fetch(guildId).catch(() => null);
                const channel = guild?.channels.cache.get(channelId);

                if (channel) {
                    const success = await this.joinChannel(channel);
                    if (!success) throw new Error("Failed to join voice channel.");
                } else {
                    throw new Error(`Channel ${channelId} not found in guild ${guildId}.`);
                }
            } else {
                // Ensure subscribed if already in channel
                this.connection.subscribe(this.effectPlayer);
            }

            // השמעת הקובץ כאפקט (כדי לא לעצור מוזיקה אם קיימת בעתיד)
            return await this.playEffect(filePath);
        } catch (e) {
            log(`❌ [AudioManager] playLocalFile Error: ${e.message}`);
            return false;
        }
    }

    /**
     * ✅ מנגן קובץ ומחזיר Promise שנפתר רק כשהקובץ סיים להתנגן (למניעת חפיפות)
     */
    async playLocalFileAndWait(guildId, channelId, filePath) {
        const played = await this.playLocalFile(guildId, channelId, filePath);
        if (!played) return false;

        return new Promise((resolve) => {
            const listener = () => {
                resolve(true);
            };
            // מאזין חד פעמי לסיום הניגון
            this.effectPlayer.once(AudioPlayerStatus.Idle, listener);
        });
    }

    /**
     * מנגן שיר ארוך (Track)
     */
    async playTrack(filePath, trackName) {
        if (!this.connection) return "NotConnected";

        try {
            const stream = fs.createReadStream(filePath);
            const resource = createAudioResource(stream, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });
            resource.volume.setVolume(1.0);

            this.musicPlayer.play(resource);
            this.connection.subscribe(this.musicPlayer);
            this.currentTrack = { path: filePath, name: trackName };
            return true;
        } catch (error) {
            log(`❌ Play Track Error: ${error.message}`);
            return false;
        }
    }

    /**
     * מנגן אפקט קצר (Effect)
     */
    async playEffect(filePath) {
        if (!this.connection) return "NotConnected";

        try {
            if (this.currentTrack) {
                this.musicPlayer.pause();
            }

            const stream = fs.createReadStream(filePath);
            const resource = createAudioResource(stream, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });
            resource.volume.setVolume(1.0);

            this.effectPlayer.play(resource);
            this.connection.subscribe(this.effectPlayer);

            return true;
        } catch (error) {
            log(`❌ Play Effect Error: ${error.message}`);
            return false;
        }
    }

    stop() {
        this.musicPlayer.stop();
        this.effectPlayer.stop();
        this.currentTrack = null;
        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }
    }

    togglePause() {
        if (this.musicPlayer.state.status === AudioPlayerStatus.Playing) {
            this.musicPlayer.pause();
            return "paused";
        } else {
            this.musicPlayer.unpause();
            return "resumed";
        }
    }

    /**
     * 🤫 Wait for silence in the channel before playing
     * @param {number} minSilenceMs - How long it must be silent (default 1.5s)
     * @param {number} maxWaitMs - Max time to wait before forcing (default 10s)
     */
    async waitForSilence(minSilenceMs = 1500, maxWaitMs = 10000) {
        if (!this.connection) return true;

        const startTime = Date.now();
        let silenceStart = Date.now();

        return new Promise((resolve) => {
            const check = setInterval(() => {
                const now = Date.now();
                // Check Max Wait
                if (now - startTime > maxWaitMs) {
                    log('⏳ [Audio] Timeout waiting for silence. Playing anyway.');
                    clearInterval(check);
                    resolve(true);
                    return;
                }

                // Check Speaking Status
                // The logical map is internal, but users.size works generally for active speaking SSRCs
                const isSomeoneSpeaking = this.connection.receiver.speaking.users.size > 0;

                if (isSomeoneSpeaking) {
                    silenceStart = now; // Reset silence counter
                } else {
                    const silenceDuration = now - silenceStart;
                    if (silenceDuration >= minSilenceMs) {
                        // log(`🤫 [Audio] Detected ${silenceDuration}ms silence. Proceeding.`);
                        clearInterval(check);
                        resolve(true);
                        return;
                    }
                }
            }, 200); // Check every 200ms
        });
    }
}

module.exports = new AudioManager();