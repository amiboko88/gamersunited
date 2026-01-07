// 📁 handlers/birthday/broadcaster.js
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { log } = require('../../utils/logger');
const { InputFile } = require('grammy');

const CHANNELS = {
    DISCORD_MAIN: '583575179880431616', // ערוץ ימי הולדת
    TELEGRAM_MAIN: process.env.TELEGRAM_CHAT_ID
};

async function broadcastCelebration(clients, userData, cardBuffer) {
    const displayName = userData.identity?.displayName || 'Gamer';
    const age = userData.identity?.birthday?.age;

    // 1. Discord
    if (clients.discord) {
        try {
            const channel = await clients.discord.channels.fetch(CHANNELS.DISCORD_MAIN).catch(() => null);
            if (channel) {
                const attachment = new AttachmentBuilder(cardBuffer, { name: 'bday.png' });
                const embed = new EmbedBuilder()
                    .setTitle(`🎉 יום הולדת שמח: ${displayName}`)
                    .setDescription(`חוגגים היום **${age}** לאגדה! 🎂\nשמעון פינק אותך ב-500 ש"ח מתנה.`)
                    .setColor('#FFD700')
                    .setImage('attachment://bday.png');

                await channel.send({ content: `@everyone`, embeds: [embed], files: [attachment] });
            }
        } catch (e) { log(`❌ Discord Bday Fail: ${e.message}`); }
    }

    // 2. WhatsApp
    if (clients.whatsapp && clients.waGroupId) {
        try {
            const caption = `🎉 *מזל טוב ל-${displayName}!* 🎉\n\nהיום חוגגים ${age}! 🎂\nקיבלת מתנה לחשבון שלך.\nמזל טוב מכולנו! ❤️`;
            await clients.whatsapp.sendMessage(clients.waGroupId, { image: cardBuffer, caption: caption });
        } catch (e) { log(`❌ WhatsApp Bday Fail: ${e.message}`); }
    }

    // 3. Telegram
    if (clients.telegram && CHANNELS.TELEGRAM_MAIN) {
        try {
            const caption = `🎈 <b>מזל טוב ל-${displayName}!</b>\nחוגגים ${age} היום! 🚀`;
            const msg = await clients.telegram.api.sendPhoto(CHANNELS.TELEGRAM_MAIN, new InputFile(cardBuffer), {
                caption: caption,
                parse_mode: 'HTML'
            });
            await clients.telegram.api.pinChatMessage(CHANNELS.TELEGRAM_MAIN, msg.message_id).catch(() => {});
        } catch (e) { log(`❌ Telegram Bday Fail: ${e.message}`); }
    }
}

// פונקציית עזר להודעות וואטסאפ ישירות (כמו רשימת הבושה)
async function sendDirectWhatsApp(clients, text, mentions = []) {
    if (clients.whatsapp && clients.waGroupId) {
        try {
            const mentionsJid = mentions.map(m => m.replace('@', '') + '@s.whatsapp.net');
            await clients.whatsapp.sendMessage(clients.waGroupId, { text, mentions: mentionsJid });
        } catch (e) { log(`❌ WhatsApp Direct Fail: ${e.message}`); }
    }
}

module.exports = { broadcastCelebration, sendDirectWhatsApp };