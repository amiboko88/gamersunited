// 📁 handlers/ranking/broadcaster.js
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { InputFile } = require('grammy');
const { log } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const CHANNELS = {
    DISCORD_LEADERBOARD: '1375415570937151519',
    TELEGRAM_MAIN: process.env.TELEGRAM_CHAT_ID
};

const HEADER_PATH = path.join(__dirname, '../../assets/leaderboard_header.png');

class RankingBroadcaster {

    /**
     * הפצה לדיסקורד - עריכת הודעה קיימת או שליחה חדשה
     */
    async broadcastDiscord(client, imageBuffer, weekNum, lastMessageId) {
        if (!client) return null;

        try {
            const channel = await client.channels.fetch(CHANNELS.DISCORD_LEADERBOARD).catch(() => null);
            if (!channel) {
                log(`⚠️ Discord Channel ${CHANNELS.DISCORD_LEADERBOARD} not found.`);
                return null;
            }

            const filesToSend = [];
            if (fs.existsSync(HEADER_PATH)) {
                filesToSend.push(new AttachmentBuilder(HEADER_PATH, { name: 'header.png' }));
            }
            filesToSend.push(new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' }));

            const embed = new EmbedBuilder()
                .setTitle(`🏆 טבלת האלופים - שבוע #${weekNum}`)
                .setColor('#FFD700')
                //.setImage('attachment://leaderboard.png') // מבוטל כדי שלא יהיה בתוך האמבד הקטן
                .setFooter({ text: 'הנתונים מתאפסים בכל מוצ"ש ב-21:00' })
                .setTimestamp();

            const payload = {
                content: `**סיכום שבועי - שבוע ${weekNum}** 👑`,
                embeds: [embed],
                files: filesToSend
            };

            // ניסיון עריכה
            if (lastMessageId) {
                try {
                    const existingMsg = await channel.messages.fetch(lastMessageId);
                    if (existingMsg) {
                        await existingMsg.edit(payload);
                        log('✅ הודעת הלידרבורד הקבועה עודכנה.');
                        return existingMsg.id;
                    }
                } catch (e) {
                    log('⚠️ לא ניתן לערוך (הודעה נמחקה). שולח חדשה.');
                }
            }

            // ניקוי חדר ושליחה חדשה
            await channel.bulkDelete(5).catch(() => { });

            // שינוי אסטרטגי: שליחת התמונה בנפרד (לא בתוך Embed) כדי שתהיה גדולה
            // קודם שולחים את האמבד (טקסט)
            // await channel.send({ embeds: [embed] }); // אופציונלי - אם רוצים להפריד לגמרי

            // אבל המשתמש רוצה הכל ביחד, פשוט שהתמונה תהיה גדולה.
            // בדיסקורד, אם יש attachment ולא embed image, זה מוצג גדול למטה.
            const newMsg = await channel.send(payload);
            return newMsg.id;

        } catch (e) {
            log(`❌ Discord Broadcast Fail: ${e.message}`);
            return null;
        }
    }

    /**
     * הפצה לפלטפורמות אחרות
     */
    async broadcastOthers(clients, imageBuffer, weekNum) {
        const caption = `🏆 *טבלת האלופים - שבוע #${weekNum}*`;

        if (clients.whatsapp && clients.waGroupId) {
            try {
                await clients.whatsapp.sendMessage(clients.waGroupId, {
                    image: imageBuffer,
                    caption: caption
                });
            } catch (e) {
                log(`❌ WhatsApp Board Fail: ${e.message}`);

                // Retry specific for Connection Closed
                if (e.message.includes('Connection Closed') || e.message.includes('Stream Ended')) {
                    try {
                        log('🔄 [Broadcaster] Retrying WhatsApp with fresh socket...');
                        const { getWhatsAppSock } = require('../../whatsapp/index');
                        const freshSock = getWhatsAppSock();
                        if (freshSock) {
                            await freshSock.sendMessage(clients.waGroupId, {
                                image: imageBuffer,
                                caption: caption
                            });
                            log('✅ WhatsApp Retry Success!');
                        }
                    } catch (retryErr) {
                        log(`❌ WhatsApp Retry Fail: ${retryErr.message}`);
                    }
                }
            }
        }

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