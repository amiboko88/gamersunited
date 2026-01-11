// 📁 discord/events/messageCreate.js
const { Events, ChannelType } = require('discord.js'); // ChannelType חובה לזיהוי DM
const brain = require('../../handlers/ai/brain');
const xpManager = require('../../handlers/economy/xpManager');
const matchmaker = require('../../handlers/matchmaker'); // ✅ השדכן

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // לא מגיבים לבוטים
        if (message.author.bot) return;

        try {
            // 0. בדיקת DM עבור ה-Matchmaker
            if (message.channel.type === ChannelType.DM) {
                await matchmaker.handleDiscordDM(message);
                return; // עוצרים כאן בפרטי
            }

            // 1. XP - משתמש ב-Manager המרכזי
            await xpManager.handleXP(message.author.id, 'discord', message.content, message, (msg) => message.reply(msg));

            // 2. תשובה לשמעון
            const isMentioned = message.mentions.has(message.client.user);
            const content = message.content.toLowerCase();
            const hasTrigger = content.includes('שמעון') || content.includes('שימי');
            
            if (isMentioned || hasTrigger) {
                await message.channel.sendTyping();

                // ניקוי תיוגים מהטקסט שנשלח ל-AI
                let cleanText = message.content.replace(/<@!?\d+>/g, '').trim();

                // שליחה למוח המרכזי
                const response = await brain.ask(message.author.id, 'discord', cleanText);
                
                if (response) {
                    await message.reply(response);
                }
            }
        } catch (error) {
            console.error(`❌ [Discord Message] Error: ${error.message}`);
        }
    },
};