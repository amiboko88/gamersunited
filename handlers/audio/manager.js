// 📁 handlers/audio/manager.js
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus,
    entersState
} = require('@discordjs/voice');
const { log } = require('../../utils/logger');
const path = require('path');

class AudioManager {
    constructor() {
        this.connection = null;
        
        // נגן ראשי (למוזיקה)
        this.musicPlayer = createAudioPlayer();
        
        // נגן משני (לאפקטים)
        this.effectPlayer = createAudioPlayer();
        
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
            
            // וידוא שהחיבור התבסס
            await entersState(this.connection, VoiceConnectionStatus.Ready, 5000);
            
            this.connection.subscribe(this.musicPlayer);
            return true;
        } catch (error) {
            log(`❌ [AudioManager] Join Error: ${error.message}`);
            return false;
        }
    }

    async playTrack(filePath, trackName) {
        if (!this.connection) return "NotConnected";
        
        try {
            // הוספת inlineVolume: true מכריחה שימוש ב-FFmpeg ופותרת בעיות שקט
            const resource = createAudioResource(filePath, { inlineVolume: true });
            resource.volume.setVolume(1.0); // ווליום רגיל

            this.musicPlayer.play(resource);
            this.connection.subscribe(this.musicPlayer);
            this.currentTrack = { path: filePath, name: trackName };
            return true;
        } catch (error) {
            log(`❌ Play Track Error: ${error.message}`);
            return false;
        }
    }

    async playEffect(filePath) {
        if (!this.connection) return "NotConnected";

        try {
            // Ducking: הנמכת המוזיקה
            if (this.currentTrack) {
                this.musicPlayer.pause();
            }

            // יצירת משאב עם FFmpeg מובנה
            const resource = createAudioResource(filePath, { inlineVolume: true });
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
}

module.exports = new AudioManager();