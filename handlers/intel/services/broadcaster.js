const { log } = require('../../../utils/logger');
const enricher = require('./enricher');

class IntelBroadcaster {

    /**
     * Broadcasts an item to all connected platforms.
     * Automatically enriches the item with AI summary if needed.
     * 
     * @param {Object} item - The news item/update to broadcast
     * @param {Object} clients - { discord, whatsapp, telegram } clients
     */
    async broadcast(item, clients) {
        if (!item) return;

        log(`📢 [Intel] Broadcasting: ${item.title}`);

        // 1. Enrich
        const finalItem = await enricher.enrich(item);
        let finalSummary = finalItem.aiSummary || finalItem.summary;

        // 2. Generate Graphics (Visual Upgrade)
        let imageBuffer = item.image; // Use pre-existing image if provided (e.g. Shabbat Card)

        try {
            if (!imageBuffer) {
                const newsCard = require('../../graphics/newsCard');
                // Only generate news card for actual News items, not system messages that lack image
                if (item.title && (item.title.includes('UPDATE') || item.title.includes('News'))) {
                    imageBuffer = await newsCard.generateNewsCard(finalItem);
                }
            }
        } catch (e) {
            log(`⚠️ [Intel] Graphics Gen Failed: ${e.message}`);
        }

        const { discord, whatsapp, telegram } = clients;

        // 3. WhatsApp
        try {
            const { sendToMainGroup } = require('../../../whatsapp/index');
            // If image exists, send as image with caption
            if (imageBuffer) {
                await sendToMainGroup(`${finalItem.title}\n\n${finalSummary}`, [], imageBuffer, item.tagAll || false);
            } else {
                await sendToMainGroup(`${finalSummary}`, [], null, item.tagAll || false);
            }
        } catch (e) { log(`Error Broadcast WA: ${e.message}`); }

        // 4. Telegram
        try {
            const tg = telegram && telegram.telegram ? telegram.telegram : telegram;
            if (tg) {
                const chatId = process.env.TG_MAIN_GROUP_ID || '-1001836262829';
                if (imageBuffer) {
                    await tg.sendPhoto(chatId, { source: imageBuffer }, {
                        caption: `🚨 **${finalItem.title}**\n\n${finalSummary}`,
                        parse_mode: 'Markdown'
                    });
                } else if (tg.sendMessage) {
                    await tg.sendMessage(chatId, `${finalSummary}`, { parse_mode: 'Markdown' });
                }
            }
        } catch (e) { log(`Error Broadcast TG: ${e.message}`); }

        // 5. Discord
        try {
            if (discord) {
                const channel = discord.channels.cache.find(c => c.name.includes('news') || c.name.includes('עדכונים'));
                if (channel) {
                    if (imageBuffer) {
                        await channel.send({
                            content: `**${finalItem.title}**\n${finalSummary}`,
                            files: [imageBuffer]
                        });
                    } else {
                        channel.send(`**${finalItem.title}**\n${finalSummary}`);
                    }
                }
            }
        } catch (e) { log(`Error Broadcast DS: ${e.message}`); }
    }
}

module.exports = new IntelBroadcaster();
