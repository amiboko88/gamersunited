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

        const { discord, whatsapp, telegram } = clients;

        // 2. WhatsApp
        try {
            // We use the whatsapp module's exported function if possible, 
            // but since we are refactoring, we might need to rely on the socket passed or the module.
            // Manager was using: const { sendToMainGroup } = require('../../whatsapp/index');
            // We'll stick to that for now to avoid breaking the specific implementation of "Main Group"
            const { sendToMainGroup } = require('../../../whatsapp/index');
            await sendToMainGroup(`${finalSummary}\n\n🔗 ${item.link}`);
        } catch (e) { log(`Error Broadcast WA: ${e.message}`); }

        // 3. Telegram
        try {
            if (telegram) {
                const chatId = process.env.TG_MAIN_GROUP_ID || '-1001836262829';
                await telegram.telegram.sendMessage(chatId, `${finalSummary}\n\n[קרא עוד](${item.link})`, { parse_mode: 'Markdown' });
            }
        } catch (e) { log(`Error Broadcast TG: ${e.message}`); }

        // 4. Discord
        try {
            if (discord) {
                const channel = discord.channels.cache.find(c => c.name.includes('news') || c.name.includes('עדכונים'));
                if (channel) channel.send(`**${item.title}**\n${finalSummary}\n${item.link}`);
            }
        } catch (e) { log(`Error Broadcast DS: ${e.message}`); }
    }
}

module.exports = new IntelBroadcaster();
