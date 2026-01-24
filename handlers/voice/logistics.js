// 📁 handlers/voice/logistics.js
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { log } = require('../../utils/logger');
const musicPlayer = require('../audio/manager'); // חיבור למערכת השמע המעודכנת
const path = require('path');
const fs = require('fs');

const CONFIG = {
    FIFO_FIXED_CHANNEL: '1231453923387379783', // הערוץ הקבוע שעליו שמעון שומר
    COUNTER_CAT: '689124379019313214',         // הקטגוריה שבה ייוצר ה-In Voice
    COUNTER_PREFIX: '🔊 In Voice:',
    BF6_CHANNEL: '1403121794235240489',        // ערוץ הכרוז
    BF6_DIR: path.join(__dirname, '../../assets/audio/bf6')
};

class VoiceLogistics {
    constructor() {
        this.activeCounterId = null;
    }

    /**
     * המנוע הראשי: מעדכן את המונה או מוחק אותו בהתאם למצב ב-FIFO
     */
    async updateVoiceIndicator(guild) {
        try {
            const fifoChannel = guild.channels.cache.get(CONFIG.FIFO_FIXED_CHANNEL);
            if (!fifoChannel) return;

            // 1. ספירת משתמשים (ללא בוטים) בערוץ ה-FIFO הספציפי
            const usersInFifo = fifoChannel.members.filter(m => !m.user.bot).size;

            // 2. חיפוש ערוץ ה-In Voice הקיים (בדיקה בזיכרון או בשרת)
            let counterChannel = this.activeCounterId ? guild.channels.cache.get(this.activeCounterId) : null;
            if (!counterChannel) {
                counterChannel = guild.channels.cache.find(c =>
                    c.parentId === CONFIG.COUNTER_CAT &&
                    c.name.startsWith(CONFIG.COUNTER_PREFIX)
                );
            }

            // --- תרחיש א': יש אנשים בחדר ---
            if (usersInFifo > 0) {
                const newName = `${CONFIG.COUNTER_PREFIX} ${usersInFifo}`;

                if (!counterChannel) {
                    // יוצרים ערוץ חדש כי הוא לא קיים
                    const newChan = await guild.channels.create({
                        name: newName,
                        type: ChannelType.GuildVoice,
                        parent: CONFIG.COUNTER_CAT,
                        position: fifoChannel.position, // Insert ABOVE the FIFO channel (pushes FIFO down)
                        permissionOverwrites: [
                            { id: guild.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] }
                        ]
                    });
                    this.activeCounterId = newChan.id;
                    log(`✨ [Voice] נוצר ערוץ אינדיקטור: ${newName}`);
                } else {
                    // מעדכנים שם רק אם הוא השתנה (כדי למנוע Rate Limit)
                    this.activeCounterId = counterChannel.id;
                    if (counterChannel.name !== newName) {
                        await counterChannel.setName(newName).catch(() => { });
                    }
                }
            }
            // --- תרחיש ב': החדר ריק ---
            else if (counterChannel) {
                log(`🧹 [Voice] חדר FIFO התרוקן. מוחק אינדיקטור...`);
                await counterChannel.delete('FIFO Empty').catch(() => { });
                this.activeCounterId = null;
            }
        } catch (error) {
            log(`❌ [VoiceLogistics] Error: ${error.message}`);
        }
    }

    /**
     * כרוז BF6 (פתיח מוזיקלי)
     */
    async handleBF6Announcer(member, channelId) {
        if (channelId !== CONFIG.BF6_CHANNEL) return;

        try {
            if (!fs.existsSync(CONFIG.BF6_DIR)) {
                log(`⚠️ [BF6] תיקייה חסרה בנתיב: ${CONFIG.BF6_DIR}`);
                return;
            }
            const files = fs.readdirSync(CONFIG.BF6_DIR).filter(f => f.endsWith('.mp3'));
            if (files.length === 0) {
                log(`⚠️ [BF6] לא נמצאו קבצי mp3 בתיקייה.`);
                return;
            }

            const randomSound = files[Math.floor(Math.random() * files.length)];
            const filePath = path.join(CONFIG.BF6_DIR, randomSound);

            log(`[BF6] מנגן פתיח: ${randomSound} עבור ${member.displayName}`);

            // שימוש בפונקציה החדשה ב-AudioManager
            await musicPlayer.playLocalFile(member.guild.id, channelId, filePath);

        } catch (e) {
            log(`❌ [BF6 Announcer] Error: ${e.message}`);
        }
    }

    /**
     * 🗑️ (Deprecated) MVP Logic moved to mvp_manager.js
     * This ensures no accidental calls to the old broken system.
     */
    async handleMVPEntrance(member, channelId) {
        // Deprecated. See handlers/voice/mvp_manager.js
        return;
    }
}

module.exports = new VoiceLogistics();