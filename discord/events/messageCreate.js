// 📁 discord/events/messageCreate.js
const { Events, ChannelType } = require('discord.js');
const brain = require('../../handlers/ai/brain');
const xpManager = require('../../handlers/economy/xpManager');
const matchmaker = require('../../handlers/matchmaker'); // ✅ השדכן

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        try {
            // 0. בדיקת DM עבור ה-Matchmaker (קישור טלפון)
            if (message.channel.type === ChannelType.DM) {
                await matchmaker.handleDiscordDM(message);
                return;
            }

            // 1. XP
            await xpManager.handleXP(message.author.id, 'discord', message.content, message, (msg) => message.reply(msg));

            // --- ☠️ Kill Switch Trigger (Discord) ---
            if (message.reference && message.mentions.has(message.client.user)) {
                const db = require('../../utils/firebase');
                const mvpDoc = await db.collection('system_metadata').doc('current_mvp').get();
                if (mvpDoc.exists) {
                    const mvpData = mvpDoc.data();
                    if (message.author.id === mvpData.id) {
                        const targetMsg = await message.channel.messages.fetch(message.reference.messageId);
                        if (targetMsg && !targetMsg.author.bot) {
                            console.log(`☠️ [Discord] Kill Switch Triggered by MVP against ${targetMsg.author.displayName}`);
                            const audioPath = await brain.executeKillSwitch(targetMsg.author.id, 'discord');
                            if (audioPath) {
                                await message.reply({ content: `🫡 פקודת חיסול התקבלה.`, files: [audioPath] });
                                return;
                            }
                        }
                    }
                }
            }

            // 2. תשובה לשמעון
            const isMentioned = message.mentions.has(message.client.user);
            const content = message.content.toLowerCase();
            const hasTrigger = content.includes('שמעון') || content.includes('שימי');

            if (isMentioned || hasTrigger) {
                await message.channel.sendTyping();
                let cleanText = message.content.replace(/<@!?\d+>/g, '').trim();
                const response = await brain.ask(message.author.id, 'discord', cleanText);
                if (response) await message.reply(response);
            }
        } catch (error) {
            console.error(`❌ [Discord Message] Error: ${error.message}`);
        }
    },
};