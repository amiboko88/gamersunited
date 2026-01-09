// 📁 handlers/ranking/broadcaster.js
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { InputFile } = require('grammy'); 
const { log } = require('../../utils/logger');

// הגדרת ערוצים קבועה
const CHANNELS = {
    DISCORD_LEADERBOARD: '1375415570937151519',
    TELEGRAM_MAIN: process.env.TELEGRAM_CHAT_ID
};

class RankingBroadcaster {

    async broadcastAll(imageBuffer, weekNum, clients) {
        if (!imageBuffer) return;

        const caption = `🏆 **טבלת האלופים - שבוע #${weekNum}**`;

        // 1. Discord
        if (clients.discord) {
            try {
                const channel = await clients.discord.channels.fetch(CHANNELS.DISCORD_LEADERBOARD).catch(() => null);
                
                if (channel) {
                    const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });
                    const embed = new EmbedBuilder()
                        .setTitle(caption)
                        .setColor('#FFD700')
                        .setImage('attachment://leaderboard.png')
                        .setFooter({ text: 'הנתונים מתאפסים בכל מוצ"ש ב-20:00' });

                    await channel.send({ embeds: [embed], files: [attachment] });
                    log(`✅ Discord Leaderboard sent to channel ${CHANNELS.DISCORD_LEADERBOARD}`);
                } else {
                    log(`⚠️ Discord Leaderboard Channel ${CHANNELS.DISCORD_LEADERBOARD} not found.`);
                }
            } catch (e) { log(`❌ Discord Board Fail: ${e.message}`); }
        }

        // 2. WhatsApp (תיקון: שליחה ישירה ללא ספרייה חיצונית)
        if (clients.whatsapp && clients.waGroupId) {
            try {
                // Baileys יודע לקבל Buffer ישירות בשדה image
                await clients.whatsapp.sendMessage(clients.waGroupId, { 
                    image: imageBuffer, 
                    caption: `🏆 *סיכום שבועי #${weekNum}*` 
                });
            } catch (e) { log(`❌ WhatsApp Board Fail: ${e.message}`); }
        }

        // 3. Telegram
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