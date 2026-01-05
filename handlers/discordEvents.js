// 📁 handlers/discordEvents.js
const { ActivityType } = require('discord.js');
const db = require('../utils/firebase');
const { ensureUserExists } = require('../utils/userUtils');
const welcomeImage = require('./welcomeImage'); // מוודא שטוען את ה-module.exports
const verificationButton = require('./verificationButton');
const { handleVoiceStateUpdate } = require('./voiceHandler');
const { trackGamePresence } = require('./presenceTracker');
const { trackMessage } = require('./statTracker'); // הוספנו את trackMessage
const { isSpam } = require('./antispam');
const smartChat = require('./smartChat');

/**
 * רושם את כל אירועי הדיסקורד ללקוח
 * @param {import('discord.js').Client} client 
 */
function registerDiscordEvents(client) {
    
    // 👋 כניסת חבר חדש
    client.on('guildMemberAdd', async member => {
        try {
            // 1. יצירת רשומה ב-DB
            await ensureUserExists(member.id, member.displayName, 'discord');
            
            // 2. תמונת ברוך הבא (אם welcomeImage מייצא פונקציה שמקבלת client, זה יופעל שם בנפרד, 
            // אבל כאן אנחנו מוודאים שהלוגיקה קיימת)
            // הערה: welcomeImage.js הנוכחי מאזין בעצמו ל-client, אז נקרא לו ב-setup הראשי.
            
            // 3. שליחת הודעת אימות בפרטי
            const verificationChannelId = '1120791404583587971'; // קבוע
            await member.send(`ברוך הבא ל-Gamers United! 👋\nכדי להיכנס לעניינים, לחץ על הלינק ובצע אימות:\nhttps://discord.com/channels/${member.guild.id}/${verificationChannelId}`)
                .catch(() => console.log(`DM חסום ל-${member.user.tag}`));

        } catch (error) {
            console.error('GuildMemberAdd Error:', error);
        }
    });

    // 👋 עזיבת חבר
    client.on('guildMemberRemove', async member => {
        try {
            await db.collection('users').doc(member.id).set({
                tracking: { status: 'left', leftAt: new Date().toISOString() }
            }, { merge: true });
        } catch (e) { console.error('GuildMemberRemove Error:', e); }
    });

    // 🎤 שינוי מצב קול (Voice)
    client.on('voiceStateUpdate', handleVoiceStateUpdate);

    // 🎮 שינוי נוכחות (Presence/Games)
    client.on('presenceUpdate', (oldPresence, newPresence) => trackGamePresence(newPresence));

    // 💬 הודעה חדשה (Chat)
    client.on('messageCreate', async message => {
        if (message.author.bot) return;

        // 1. מעקב הודעות (XP)
        if (trackMessage) await trackMessage(message.author.id);

        // 2. אנטי ספאם
        if (await isSpam(message)) return;

        // 3. צ'אט חכם (שמעון עונה)
        await smartChat(message);
    });

    console.log('✅ Discord Events Registered.');
}

module.exports = { registerDiscordEvents };