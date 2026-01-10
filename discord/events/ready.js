// 📁 discord/events/ready.js
const { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { log } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

// --- ייבוא המטפלים (Handlers) ---
const scheduler = require('../../handlers/scheduler');
const birthdayManager = require('../../handlers/birthday/manager');
const fifoCleaner = require('../../handlers/fifo/cleaner');
const statusRotator = require('../../handlers/system/statusRotator'); 
const voiceLogistics = require('../../handlers/voice/logistics'); // ✅ תוספת למערכת הקולית

// הגדרות ערוץ האימות
const VERIFY_CHANNEL_ID = '1120791404583587971';
// נתיב לתמונה המקומית
const VERIFY_IMAGE_PATH = './assets/verify.png'; 

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        log(`🤖 [Discord] Logged in as ${client.user.tag}`);

        // --- סנכרון קולי ראשוני בעלייה ---
        const guild = client.guilds.cache.first();
        if (guild) {
            await voiceLogistics.updateVoiceIndicator(guild);
        }

        // 1. אתחול ימי הולדת
        birthdayManager.init(client, null, null, null);

        // 2. אתחול המתזמן הראשי
        scheduler.initScheduler(client);
        
        // 3. הפעלת מנקה הפיפו האוטומטי
        fifoCleaner.startAutoClean(client);

        // 4. הפעלת רוטציית סטטוסים (מהמיקום החדש)
        if (statusRotator && typeof statusRotator.start === 'function') {
            statusRotator.start(client);
        }

        // 5. בדיקת ערוץ האימות
        await checkVerificationChannel(client);
        
        log(`✅ [System] All systems operational.`);
    },
};

// --- פונקציית העזר לאימות (נשארה זהה למקור שלך) ---
async function checkVerificationChannel(client) {
    try {
        const channel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
        if (!channel) {
            log('[Startup] ⚠️ ערוץ האימות לא נמצא. מדלג.');
            return;
        }

        const messages = await channel.messages.fetch({ limit: 5 });
        const hasBotMessage = messages.find(m => m.author.id === client.user.id && m.components.length > 0);

        if (!hasBotMessage) {
            log('[Startup] 🛠️ הודעת אימות חסרה. יוצר חדשה...');

            let files = [];
            if (fs.existsSync(VERIFY_IMAGE_PATH)) {
                files = [{ attachment: VERIFY_IMAGE_PATH, name: 'verify.png' }];
            } else {
                console.warn(`[Startup] ⚠️ קובץ התמונה לא נמצא ב-${VERIFY_IMAGE_PATH}. נשלח ללא תמונה.`);
            }

            const embed = new EmbedBuilder().setColor(0x00FF00);
            if (files.length > 0) embed.setImage('attachment://verify.png');
            else embed.setTitle('ברוכים הבאים - אימות משתמש');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('start_verification_process') 
                    .setLabel('לחץ כאן לאימות ✅')
                    .setStyle(ButtonStyle.Success)
            );

            await channel.send({ embeds: [embed], components: [row], files: files });
            log('[Startup] ✅ הודעת אימות נוצרה בהצלחה.');
        } else {
            log('[Startup] ✅ הודעת אימות קיימת ותקינה.');
        }
    } catch (error) {
        console.error(`[Startup Error] Verification Check: ${error.message}`);
    }
}