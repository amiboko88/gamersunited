// 📁 handlers/ranking/broadcaster.js
const { AttachmentBuilder } = require('discord.js');
const { sendToMainGroup } = require('../../whatsapp/index'); // הפונקציה שלך
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const DISCORD_CHANNEL_ID = '1375415570937151519'; // ערוץ היכל התהילה
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

class RankingBroadcaster {

    /**
     * מפיץ את הדירוג לכל הפלטפורמות
     * @param {Buffer} imageBuffer - התמונה שנוצרה
     * @param {string} caption - הטקסט הנלווה
     * @param {Object} discordClient - הקליינט לשימוש
     */
    async broadcastAll(imageBuffer, caption, discordClient) {
        const promises = [];

        // 1. WhatsApp (הכי חשוב)
        promises.push(
            sendToMainGroup(caption, [], imageBuffer)
                .then(() => console.log('✅ Leaderboard sent to WhatsApp'))
                .catch(e => console.error('❌ WhatsApp Send Error:', e.message))
        );

        // 2. Discord
        if (discordClient) {
            const channel = discordClient.channels.cache.get(DISCORD_CHANNEL_ID);
            if (channel) {
                const attachment = new AttachmentBuilder(imageBuffer, { name: 'leaderboard.png' });
                promises.push(
                    channel.send({ content: caption, files: [attachment] })
                        .then(() => console.log('✅ Leaderboard sent to Discord'))
                        .catch(e => console.error('❌ Discord Send Error:', e.message))
                );
            }
        }

        // 3. Telegram
        if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
            promises.push(
                this.sendToTelegram(imageBuffer, caption)
                    .then(() => console.log('✅ Leaderboard sent to Telegram'))
                    .catch(e => console.error('❌ Telegram Send Error:', e.message))
            );
        }

        await Promise.all(promises);
    }

    async sendToTelegram(imageBuffer, caption) {
        const form = new FormData();
        form.append('chat_id', TELEGRAM_CHAT_ID);
        form.append('caption', caption);
        form.append('photo', imageBuffer, 'leaderboard.png');

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, form, {
            headers: form.getHeaders()
        });
    }
}

module.exports = new RankingBroadcaster();