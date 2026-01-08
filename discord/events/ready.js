// 📁 discord/events/ready.js
const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { log } = require('../../utils/logger');
const scheduler = require('../../handlers/scheduler');
const birthdayManager = require('../../handlers/birthday/manager');
const db = require('../../utils/firebase');

// הגדרת ערוץ האימות הקבוע
const VERIFY_CHANNEL_ID = '1120791404583587971';
const VERIFY_IMAGE_URL = 'https://media.discordapp.net/attachments/1120791404583587971/1120792864679530506/Verify_Banner.png'; // (דוגמה, נדרש URL תקין שלך)

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        log(`🤖 [Discord] Logged in as ${client.user.tag}`);

        // 1. אתחול ימי הולדת
        birthdayManager.init(client, null, null, null);

        // 2. אתחול המתזמן הראשי
        scheduler.initScheduler(client);
        
        // 3. בדיקת ערוץ האימות (חדש!)
        await checkVerificationChannel(client);
    },
};

/**
 * פונקציה לווידוא קיום הודעת האימות
 */
async function checkVerificationChannel(client) {
    try {
        const channel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
        
        if (!channel) {
            log('[Startup] ⚠️ ערוץ האימות לא נמצא (ID שגוי?). מדלג.');
            return;
        }

        // בדיקת הודעות אחרונות
        const messages = await channel.messages.fetch({ limit: 5 });
        const hasBotMessage = messages.find(m => m.author.id === client.user.id && m.components.length > 0);

        if (!hasBotMessage) {
            log('[Startup] 🛠️ הודעת אימות חסרה. יוצר חדשה...');
            
            // מחיקת הודעות ישנות (אופציונלי - כדי לשמור על הערוץ נקי)
            // await channel.bulkDelete(5).catch(() => {});

            const embed = new EmbedBuilder()
                .setImage('https://i.imgur.com/P9t7gJ5.png') // שים כאן את הלינק לתמונה שלך
                .setColor(0x00FF00); // ירוק

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('start_verification_process') // ID חדש לתהליך
                        .setLabel('לחץ כאן לאימות ✅')
                        .setStyle(ButtonStyle.Success)
                );

            await channel.send({ embeds: [embed], components: [row] });
            log('[Startup] ✅ הודעת אימות נוצרה בהצלחה.');
        } else {
            log('[Startup] ✅ הודעת אימות קיימת ותקינה.');
        }

    } catch (error) {
        console.error(`[Startup Error] Verification Check: ${error.message}`);
    }
}