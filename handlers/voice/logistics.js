// 📁 handlers/voice/logistics.js
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { log } = require('../../utils/logger');
const musicPlayer = require('../music/player'); // חיבור לנגן
const path = require('path');
const fs = require('fs');

// הגדרות (מתוך הקבצים שלך)
const CONFIG = {
    FIFO_CHANNEL: process.env.FIFO_CHANNEL_ID,
    FIFO_ROLE: 'FIFO',
    BF6_CHANNEL: '1403121794235240489',
    COUNTER_CAT: '689124379019313214',
    COUNTER_PREFIX: '🔊 In Voice:',
    // נתיב לתיקיית המוזיקה של BF6
    BF6_DIR: path.join(__dirname, '../../music/bf6')
};

// רשימת קבצי BF6
const bf6Sounds = [
    'theme1.mp3', 'theme2.mp3', 'theme3.mp3', 'theme4.mp3', 'theme5.mp3', 'theme6.mp3', 'theme7.mp3', 'theme8.mp3'
];

class VoiceLogistics {

    constructor() {
        this.voiceCounterChannelId = null;
        this.checkBf6Files(); // בדיקה בעלייה
    }

    checkBf6Files() {
        if (!fs.existsSync(CONFIG.BF6_DIR)) {
            log(`❌ [BF6] התיקייה "music/bf6" לא קיימת. יוצר אותה...`);
            fs.mkdirSync(CONFIG.BF6_DIR, { recursive: true });
        }
    }

    /**
     * עדכון ערוץ מונה המשתמשים
     */
    async updateCounter(client) {
        if (!client || !client.guilds || !client.guilds.cache) return;
        
        const guild = client.guilds.cache.first();
        if (!guild) return;

        // ספירת כל המחוברים (ללא בוטים)
        let total = 0;
        guild.channels.cache.forEach(c => {
            if (c.type === ChannelType.GuildVoice) total += c.members.filter(m => !m.user.bot).size;
        });

        const channelName = `${CONFIG.COUNTER_PREFIX} ${total}`;
        
        // שימוש ב-ID שמור או חיפוש
        let targetChannel = this.voiceCounterChannelId ? guild.channels.cache.get(this.voiceCounterChannelId) : null;

        if (!targetChannel) {
            targetChannel = guild.channels.cache.find(c => c.name.startsWith(CONFIG.COUNTER_PREFIX) && c.parentId === CONFIG.COUNTER_CAT);
        }

        if (targetChannel) {
            this.voiceCounterChannelId = targetChannel.id;
            if (targetChannel.name !== channelName) await targetChannel.setName(channelName).catch(() => {});
        } else {
            // יצירה אם לא קיים
            try {
                const newChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    parent: CONFIG.COUNTER_CAT,
                    permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }]
                });
                this.voiceCounterChannelId = newChannel.id;
            } catch (e) { console.error('Voice Counter Create Error:', e); }
        }
    }

    /**
     * ניהול רול FIFO (נותן/לוקח רול בכניסה לחדר)
     */
    async handleFIFO(member, channelId) {
        if (!CONFIG.FIFO_CHANNEL) return;
        
        const fifoRole = member.guild.roles.cache.find(r => r.name === CONFIG.FIFO_ROLE);
        if (!fifoRole) return;

        const isInFifo = channelId === CONFIG.FIFO_CHANNEL;
        const hasRole = member.roles.cache.has(fifoRole.id);

        if (isInFifo && !hasRole) await member.roles.add(fifoRole).catch(() => {});
        else if (!isInFifo && hasRole) await member.roles.remove(fifoRole).catch(() => {});
    }

    /**
     * כרוז BF6 (מנגן מוזיקה רנדומלית בכניסה)
     */
    async handleBF6Announcer(member, channelId) {
        if (channelId !== CONFIG.BF6_CHANNEL) return;
        
        // בחירת שיר רנדומלי
        const randomSound = bf6Sounds[Math.floor(Math.random() * bf6Sounds.length)];
        const filePath = path.join(CONFIG.BF6_DIR, randomSound);

        if (!fs.existsSync(filePath)) {
            log(`⚠️ [BF6] קובץ חסר: ${randomSound}`);
            return;
        }

        log(`[BF6] מנגן את ${randomSound} עבור ${member.displayName}`);
        
        // שימוש בנגן החדש
        musicPlayer.addToQueue(member.guild.id, channelId, filePath, member.client, 'BF6_THEME');
    }
}

module.exports = new VoiceLogistics();