// 📁 discord/events/guildMemberAdd.js
const { AttachmentBuilder } = require('discord.js');
const { generateWelcomeImage } = require('../../handlers/media/welcome');
const { ensureUserExists } = require('../../utils/userUtils'); // ✅ התיקון נמצא בתוך הקובץ הזה

const WELCOME_CHANNEL_ID = '689067371843158026';

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        // 1. רישום המשתמש החדש ב-DB המאוחד (הלוגיקה תוקנה ב-Utils)
        // מעבירים את ה-displayName הנוכחי ואת הפלטפורמה
        await ensureUserExists(member.id, member.displayName, 'discord');

        // 2. יצירת תמונת ברוכים הבאים (הקוד שלך - נשאר)
        const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
        if (channel) {
            try {
                const buffer = await generateWelcomeImage(member);
                if (buffer) {
                    const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });
                    await channel.send({ content: `👋 שלום <@${member.id}>!`, files: [attachment] });
                }
            } catch (error) {
                console.error('[Welcome Image] Failed to generate/send:', error);
            }
        }
    }
};