// 📁 discord/events/messageCreate.js
const { Events, ChannelType } = require('discord.js');
const brain = require('../../handlers/ai/brain');
const xpManager = require('../../handlers/economy/xpManager');
const matchmaker = require('../../handlers/matchmaker');
const intelManager = require('../../handlers/intel/manager'); // ✅ Intel 2.0

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

            // 1. Ensures User Exists & XP
            // Lazy creation for users who joined before the bot was active
            const { ensureUserExists } = require('../../utils/userUtils');
            await ensureUserExists(message.author.id, message.author.displayName, 'discord');

            await xpManager.handleXP(message.author.id, 'discord', message.content, message, (msg) => message.reply(msg));

            // --- ☠️ Kill Switch Trigger (Discord) ---
            if (message.reference && message.mentions.has(message.client.user)) {
                // ... (Existing Kill Switch Logic) ...
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

            // --- 🕵️ INTEL SYSTEM 2.0 COMMANDS ---
            const lowerArgs = message.content.toLowerCase().split(' ');
            const cmd = lowerArgs[0];

            if (cmd === '!meta' || cmd === '!loadout') {
                await message.channel.sendTyping();
                const query = lowerArgs.slice(1).join(' ');

                if (!query) {
                    // General Meta List
                    const response = await intelManager.getMeta("list"); // Special keyword handling needed in manage.js or fallback logic
                    // Quick fix: if empty, we want top list
                    const fallback = await intelManager.getMeta("absolute");
                    await message.reply(fallback.text || String(fallback));
                    return;
                }

                const data = await intelManager.getMeta(query);

                if (typeof data === 'string') {
                    await message.reply(data);
                } else {
                    // Rich Response
                    const { AttachmentBuilder } = require('discord.js');
                    const files = [];
                    if (data.image) files.push(new AttachmentBuilder(data.image));

                    let replyContent = data.text;
                    if (data.code) replyContent += `\n\`\`\`${data.code}\`\`\``;

                    await message.reply({ content: replyContent, files: files });
                }
                return;
            }

            if (cmd === '!playlist' || cmd === '!modes') {
                await message.channel.sendTyping();
                const txt = await intelManager.getPlaylists();
                await message.reply(txt);
                return;
            }

            if (cmd === '!bf6' || cmd === '!bf') {
                await message.channel.sendTyping();
                const txt = await intelManager.getBF6();
                await message.reply(txt);
                return;
            }

            // 2. תשובה לשמעון - AI Chat
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