// 📁 handlers/audio/manager.js
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus 
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
        // כשהמוזיקה נגמרת
        this.musicPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.isLooping && this.currentTrack) {
                this.playTrack(this.currentTrack.path, this.currentTrack.name); // Loop
            } else {
                this.currentTrack = null;
            }
        });

        // כשהאפקט נגמר -> חוזרים למוזיקה
        this.effectPlayer.on(AudioPlayerStatus.Idle, () => {
            if (this.connection && this.currentTrack) {
                this.connection.subscribe(this.musicPlayer);
                this.musicPlayer.unpause(); // ממשיך מאותה נקודה
            }
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
            
            // ברירת מחדל: מחובר לנגן המוזיקה
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
            const resource = createAudioResource(filePath);
            this.musicPlayer.play(resource);
            this.connection.subscribe(this.musicPlayer); // וודא ששומעים את המוזיקה
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
            // לוגיקת Ducking: עוצרים מוזיקה -> מנגנים אפקט -> ה-Listener למעלה יחזיר את המוזיקה
            if (this.currentTrack) {
                this.musicPlayer.pause();
            }

            const resource = createAudioResource(filePath);
            this.effectPlayer.play(resource);
            this.connection.subscribe(this.effectPlayer); // מחליפים את השידור לאפקט
            
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