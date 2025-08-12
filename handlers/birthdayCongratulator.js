// 📁 handlers/birthdayCongratulator.js (גרסה משודרגת ומאוחדת)
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const db = require('../utils/firebase');
const { log } = require('../utils/logger');
const { playTTSInVoiceChannel } = require('../utils/ttsQuickPlay'); // שימוש במנגנון TTS המהיר

const TARGET_CHANNEL_ID = '583575179880431616';
const BIRTHDAY_ROLE_ID = process.env.BIRTHDAY_ROLE_ID; // יש לוודא שמשתנה הסביבה הזה קיים

const birthdayTTSMessages = [
    (name, age) => `מזל טוב ל־${name}! אתה בן ${age} היום, וזה אומר שאתה עדיין משחק ולא פרשת כמו הגדולים!`,
    (name, age) => `${name}, ${age} שנה שאתה מחזיק שליטה – אולי השנה תלמד גם להרים קבוצה?`,
    (name, age) => `היי ${name}, בגיל ${age} כבר מגיעה לך קבוצה קבועה ו־ping יציב. יאללה תעשה סדר!`,
    (name, age) => `יום הולדת שמח ${name}! גיל ${age} זה בדיוק הזמן לפרוש… סתם, תישאר איתנו 🎉`,
    (name, age) => `וואו ${name}, ${age} שנה ואתה עדיין rage quit כל סיבוב? חוגגים אותך בכל זאת!`
];

/**
 * מחשב את הגיל הנוכחי על סמך תאריך לידה.
 * @param {{day: number, month: number, year: number}} birthday 
 * @returns {number}
 */
function calculateAge(birthday) {
    const today = new Date();
    const birthDate = new Date(birthday.year, birthday.month - 1, birthday.day);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

/**
 * שולף את כל המשתמשים שחוגגים יום הולדת היום.
 * @returns {Promise<Array<object>>}
 */
async function getTodaysBirthdays() {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;

    const snapshot = await db.collection('birthdays').where('birthday.day', '==', day).where('birthday.month', '==', month).get();
    if (snapshot.empty) return [];

    const seenDiscordIds = new Set();
    const birthdays = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const discordId = data.linkedAccounts?.find(id => id.startsWith('discord:'))?.split(':')[1];

        if (discordId && !seenDiscordIds.has(discordId)) {
            seenDiscordIds.add(discordId);
            const age = calculateAge(data.birthday);
            birthdays.push({
                fullName: data.fullName,
                age,
                discordId
            });
        }
    }
    return birthdays;
}

/**
 * ✅ [שדרוג] פונקציה חדשה שמטפלת בלחיצה על כפתור הברכה הקולית.
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
async function handlePlayBirthdayTTS(interaction) {
    const member = interaction.member;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
        return interaction.reply({ content: 'אתה צריך להיות בערוץ קולי כדי לשמוע את הברכה!', ephemeral: true });
    }

    const originalMessage = interaction.message;
    const birthdayPersonName = originalMessage.embeds[0]?.title?.replace('🎉 מזל טוב ל־', '').replace('!', '') || 'חבר הקהילה';
    const ageMatch = originalMessage.embeds[0]?.description?.match(/חוגג\/ת היום \*\*(\d+)\*\* שנים/);
    const age = ageMatch ? parseInt(ageMatch[1]) : 25; // גיל ברירת מחדל אם לא נמצא

    const phrase = birthdayTTSMessages[Math.floor(Math.random() * birthdayTTSMessages.length)](birthdayPersonName, age);

    await interaction.deferReply({ ephemeral: true });
    await playTTSInVoiceChannel(voiceChannel, phrase);
    await interaction.editReply({ content: 'הברכה הושמעה! 🎤' });
}

/**
 * הפונקציה המרכזית שמופעלת על ידי CRON לשליחת ברכות יום הולדת.
 * @param {import('discord.js').Client} client 
 */
async function sendBirthdayMessage(client) {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const channel = guild?.channels.cache.get(TARGET_CHANNEL_ID);
    if (!channel?.isTextBased()) {
        log(`❌ ערוץ יום ההולדת (${TARGET_CHANNEL_ID}) לא נמצא או אינו ערוץ טקסט.`);
        return;
    }

    const todayBirthdays = await getTodaysBirthdays();
    if (todayBirthdays.length === 0) {
        log('[BIRTHDAY] אין ימי הולדת להיום.');
        return;
    }

    const todayKey = new Date().toISOString().split('T')[0]; // מפתח ייחודי לכל יום

    for (const person of todayBirthdays) {
        const logRef = db.collection('birthdayLogs').doc(`${todayKey}_${person.discordId}`);
        const logSnap = await logRef.get();
        if (logSnap.exists) {
            log(`[BIRTHDAY] ברכה עבור ${person.fullName} כבר נשלחה היום. מדלג.`);
            continue;
        }

        const member = await guild.members.fetch(person.discordId).catch(() => null);
        if (!member) continue;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 מזל טוב ל־${person.fullName}!`)
            .setDescription(`🎂 חוגג/ת היום **${person.age}** שנים!\n\nאיחולים חמים מכל קהילת **Gamers United IL** 🎈`)
            .setColor('#FF69B4')
            .setImage('attachment://happybirthday.png')
            .setFooter({ text: 'שמעון שולח חיבוק וירטואלי 🎁' })
            .setTimestamp();
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`bday_play_tts_${person.discordId}`)
                .setLabel('▶️ השמע ברכה קולית')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎤')
        );

        try {
            await channel.send({
                content: `@everyone חגיגה בקהילה! 🎊 בואו לאחל מזל טוב ל-${member}!`,
                embeds: [embed],
                files: [path.join(__dirname, '../assets/happybirthday.png')],
                components: [row]
            });

            if (BIRTHDAY_ROLE_ID) {
                await member.roles.add(BIRTHDAY_ROLE_ID).catch(err => log(`⚠️ לא ניתן היה להוסיף תפקיד יום הולדת ל-${person.fullName}: ${err.message}`));
            }

            await logRef.set({ sentAt: new Date() });
            log(`[BIRTHDAY] ✅ ברכת יום הולדת נשלחה בהצלחה ל־${person.fullName}`);

        } catch (error) {
            log(`❌ שגיאה קריטית בשליחת ברכת יום הולדת ל-${person.fullName}:`, error);
        }
    }
}

module.exports = { 
    sendBirthdayMessage,
    handlePlayBirthdayTTS 
};