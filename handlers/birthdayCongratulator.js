// 📁 handlers/birthdayCongratulator.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const db = require('../utils/firebase');
const { log } = require('../utils/logger');
const { playTTSInVoiceChannel } = require('../utils/ttsQuickPlay');

const TARGET_CHANNEL_ID = '583575179880431616';
const BIRTHDAY_ROLE_ID = process.env.BIRTHDAY_ROLE_ID;

// ברכות קוליות
const birthdayTTSMessages = [
    (name, age) => `מזל טוב ל־${name}! אתה בן ${age} היום, וזה אומר שאתה עדיין משחק ולא פרשת כמו הגדולים!`,
    (name, age) => `${name}, ${age} שנה שאתה מחזיק שליטה – אולי השנה תלמד גם להרים קבוצה?`,
    (name, age) => `היי ${name}, בגיל ${age} כבר מגיעה לך קבוצה קבועה ו־ping יציב. יאללה תעשה סדר!`,
];

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

// ✅ שליפה מהמבנה החדש והמאוחד
async function getTodaysBirthdays() {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;

    try {
        // מחפשים משתמשים שהיום והחודש בזהות שלהם תואמים להיום
        const snapshot = await db.collection('users')
            .where('identity.birthday.day', '==', currentDay)
            .where('identity.birthday.month', '==', currentMonth)
            .get();

        if (snapshot.empty) return [];

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                day: data.identity.birthday.day,
                month: data.identity.birthday.month,
                year: data.identity.birthday.year,
                fullName: data.identity.displayName || 'Gamer'
            };
        });
    } catch (error) {
        log(`❌ שגיאה בשליפת ימי הולדת מה-DB המאוחד:`, error);
        return [];
    }
}

async function processAndSendGreetings(client, birthdays) {
    const channel = client.channels.cache.get(TARGET_CHANNEL_ID);
    if (!channel) return;

    for (const person of birthdays) {
        try {
            const member = await channel.guild.members.fetch(person.id).catch(() => null);
            if (!member) continue;

            const age = calculateAge(person);

            // 1. השמעת ברכה קולית (אם המשתמש בשיחה)
            if (member.voice.channel) {
                const ttsMsg = birthdayTTSMessages[Math.floor(Math.random() * birthdayTTSMessages.length)](member.displayName, age);
                playTTSInVoiceChannel(member.voice.channel, ttsMsg);
            }

            // 2. שליחת כרטיס ברכה לערוץ
            const embed = new EmbedBuilder()
                .setTitle(`🎉 יום הולדת שמח, ${person.fullName}!`)
                .setDescription(`היום אנחנו חוגגים **${age}** שנים של כישרון (או חוסר כישרון) במשחקים! 🎂\nמאחלים לך פינג נמוך, FPS גבוה, ושתפסיק למות ראשון.`)
                .setColor('#FFD700')
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('send_wish').setLabel('ברך אותו 🥳').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('roast_birthday').setLabel('רד עליו 🎤').setStyle(ButtonStyle.Danger)
            );

            await channel.send({
                content: `@everyone חגיגה בקהילה! 🎊 בואו לאחל מזל טוב ל-${member}!`,
                embeds: [embed],
                files: [path.join(__dirname, '../assets/happybirthday.png')],
                components: [row]
            });

            // 3. הוספת רול (אם יש)
            if (BIRTHDAY_ROLE_ID) {
                await member.roles.add(BIRTHDAY_ROLE_ID).catch(err => log(`⚠️ לא ניתן היה להוסיף רול יום הולדת: ${err.message}`));
            }

            // 4. תיעוד בתיק המשתמש (במקום בקולקשן נפרד)
            await db.collection('users').doc(person.id).update({
                'tracking.lastBirthdayCelebrated': new Date().getFullYear()
            });

            log(`[BIRTHDAY] ✅ יום הולדת שמח ל-${person.fullName} (${age})`);

        } catch (error) {
            log(`❌ שגיאה בחגיגת יום הולדת ל-${person.id}:`, error);
        }
    }
}

async function sendBirthdayMessage(client) {
    const todayBirthdays = await getTodaysBirthdays();
    if (todayBirthdays.length === 0) {
        // log('[BIRTHDAY CRON] אין ימי הולדת להיום.');
        return;
    }
    await processAndSendGreetings(client, todayBirthdays);
}

module.exports = { sendBirthdayMessage };