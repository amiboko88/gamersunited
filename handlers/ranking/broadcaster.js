// 📁 handlers/ranking/broadcaster.js
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { InputFile } = require('grammy'); 
const { log } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

// הגדרת ערוצים
const CHANNELS = {
    DISCORD_LEADERBOARD: '1375415570937151519',
    TELEGRAM_MAIN: process.env.TELEGRAM_CHAT_ID
};

// נתיב לתמונת הכותרת הקבועה (אם יש לך כזו)
const HEADER_PATH = path.join(__dirname, '../../assets/leaderboard_header.png');

class RankingBroadcaster {

    /**
     * מטפל בדיסקורד: עריכה חכמה או שליחה מחדש
     * מחזיר את ה-Message ID לשמירה ב-DB
     */
    async broadcastDiscord(client, imageBuffer, weekNum, lastMessageId) {
        if (!client) return null;

        try {
            const channel = await client.channels.fetch(CHANNELS.DISCORD_LEADERBOARD).catch(() => null);
            if (!channel) {
                log(`⚠️ Discord Channel ${CHANNELS.DISCORD_LEADERBOARD} not found.`);
                return null;
            }

            // --- 1. הכנת הקבצים (כותרת + טבלה) ---
            const filesToSend = [];
            
            // א. תמונת כותרת (אם קיימת בתיקיית assets)
            if (fs.existsSync(HEADER_PATH)) {
                filesToSend.push(new AttachmentBuilder(HEADER_PATH, { name: 'header.png' }));
            }

            // ב. הטבלה הדינמית (מה-Render)
            filesToSend.push(new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' }));

            // --- 2. הכנת התוכן (Payload) ---
            const embed = new EmbedBuilder()
                .setTitle(`🏆 טבלת האלופים - שבוע #${weekNum}`)
                .setColor('#FFD700') // זהב
                .setImage('attachment://leaderboard.png') // מציג את הטבלה בגדול
                .setFooter({ text: 'הנתונים מתאפסים בכל מוצ"ש ב-20:00' })
                .setTimestamp();

            // אם צירפנו כותרת, נשתמש בה כתמונה ראשית (Thumbnail) או שנשלח אותה מעל
            // כרגע הקוד שולח את הכותרת כקובץ מצורף ראשון (יופיע מעל האמבד)

            const payload = {
                content: `**סיכום שבועי - שבוע ${weekNum}** 👑`, // טקסט מעל התמונה
                embeds: [embed],
                files: filesToSend
            };

            // --- 3. לוגיקת עריכה (Edit vs New) ---
            if (lastMessageId) {
                try {
                    const existingMsg = await channel.messages.fetch(lastMessageId);
                    if (existingMsg) {
                        await existingMsg.edit(payload);
                        log('✅ עודכנה הודעת הלידרבורד הקיימת בדיסקורד.');
                        return existingMsg.id; // מחזירים את אותו ID
                    }
                } catch (e) {
                    log('⚠️ לא ניתן לערוך הודעה קודמת (אולי נמחקה). עובר לשליחה חדשה.');
                }
            }

            // --- 4. שליחה חדשה (אם אין ID או נכשל בעריכה) ---
            
            // ניקוי הערוץ לפני שליחה (כדי שיהיה אסתטי)
            try { await channel.bulkDelete(5).catch(() => {}); } catch(e){}

            const newMsg = await channel.send(payload);
            log(`✅ נשלחה הודעת לידרבורד חדשה (ID: ${newMsg.id}).`);
            return newMsg.id;

        } catch (e) {
            log(`❌ Discord Board Fail: ${e.message}`);
            return null;
        }
    }

    /**
     * מטפל בשאר הפלטפורמות (שליחה רגילה)
     */
    async broadcastOthers(clients, imageBuffer, weekNum) {
        const caption = `🏆 *טבלת האלופים - שבוע #${weekNum}*`;

        // 1. WhatsApp
        if (clients.whatsapp && clients.waGroupId) {
            try {
                await clients.whatsapp.sendMessage(clients.waGroupId, { 
                    image: imageBuffer, 
                    caption: caption 
                });
            } catch (e) { log(`❌ WhatsApp Board Fail: ${e.message}`); }
        }

        // 2. Telegram
        if (clients.telegram && CHANNELS.TELEGRAM_MAIN) {
            try {
                await clients.telegram.api.sendPhoto(CHANNELS.TELEGRAM_MAIN, new InputFile(imageBuffer), {
                    caption: caption,
                    parse_mode: 'Markdown'
                });
            } catch (e) { log(`❌ Telegram Board Fail: ${e.message}`); }
        }
    }
}

module.exports = new RankingBroadcaster();