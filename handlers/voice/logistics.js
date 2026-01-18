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
     * 👑 כרוז מלכותי ל-MVP (Royal Entrance)
     */
    async handleMVPEntrance(member, channelId) {
        if (!member || !channelId) return;

        try {
            const db = require('../../utils/firebase');
            const mvpDoc = await db.collection('system_metadata').doc('current_mvp').get();
            if (!mvpDoc.exists) return;

            const mvpData = mvpDoc.data();

            // בדיקה אם המשתמש שנכנס הוא ה-MVP
            if (member.id !== mvpData.id) return;

            // בדיקת תוקף הזכייה (7 ימים)
            const wonDate = new Date(mvpData.wonAt || 0);
            if ((Date.now() - wonDate) > 7 * 24 * 60 * 60 * 1000) return;

            // מניעת ספאם (Cooldown של 30 דקות לכניסה מלכותית)
            // נשתמש ב-Map מקומי או בנכס על הממבר בזיכרון
            const lastEntrance = member.lastMvpEntrance || 0;
            if (Date.now() - lastEntrance < 30 * 60 * 1000) return;

            member.lastMvpEntrance = Date.now(); // שמירה בזיכרון

            log(`👑 [Voice] ה-MVP (${member.displayName}) נכנס לחדר! מכין קבלת פנים...`);

            // במקום setTimeout פשוט, נשתמש בטיימר אסינכרוני כדי לא לתקוע את ה-Event
            setTimeout(async () => {
                try {
                    // בדיקה חוזרת שהוא עדיין שם
                    if (member.voice.channelId !== channelId) return;

                    const { getTTS } = require('../../utils/tts');

                    // טקסטים מתחלפים לקבלת פנים
                    const greetings = [
                        `הוד רוממותו ${mvpData.name} נכנס לחדר. כולם לתת כבוד.`,
                        `שימו לב! ה-MVP ${mvpData.name} הגיע.`,
                        `הבוס הגדול ${mvpData.name} כאן. שקט בבקשה.`
                    ];
                    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

                    const audioPath = await getTTS(randomGreeting);

                    if (audioPath) {
                        // ניגון דרך הנגן הראשי (פשוט וקל)
                        // נשתמש ב-playLocalFile שיודע לנהל חיבורים
                        log(`👑 [Voice] מנגן כרוז ל-MVP...`);
                        await musicPlayer.playLocalFile(member.guild.id, channelId, audioPath);
                    }
                } catch (innerError) {
                    console.error('[MVP Voice] Inner Error:', innerError);
                }
            }, 3000); // 3 שניות השהייה

        } catch (error) {
            console.error('[MVP Voice] Error:', error);
        }
    }
}

module.exports = new VoiceLogistics();