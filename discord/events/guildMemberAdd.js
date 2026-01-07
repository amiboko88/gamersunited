// 📁 discord/events/guildMemberAdd.js
const { AttachmentBuilder } = require('discord.js');
const { generateWelcomeImage } = require('../../handlers/media/welcome');
const { ensureUserExists } = require('../../utils/userUtils'); // ✅ רישום ב-DB

const WELCOME_CHANNEL_ID = '689067371843158026';

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        // 1. רישום המשתמש החדש ב-DB המאוחד
        await ensureUserExists(member.id, member.displayName, 'discord');

        // 2. יצירת תמונת ברוכים הבאים
        const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
        if (channel) {
            const buffer = await generateWelcomeImage(member);
            const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });
            await channel.send({ content: `👋 שלום <@${member.id}>!`, files: [attachment] });
        }
    }
};