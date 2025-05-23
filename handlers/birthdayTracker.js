const { EmbedBuilder, ChannelType } = require('discord.js');
const { synthesizeGoogleTTS } = require('../tts/ttsEngine');
const db = require('../utils/firebase');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = process.env.BIRTHDAY_CHANNEL_ID;
const ROLE_ID = process.env.BIRTHDAY_ROLE_ID;

function isTodayBirthday(dateString) {
  const today = new Date();
  const [month, day] = dateString.split('-');
  return today.getMonth() + 1 === parseInt(month) && today.getDate() === parseInt(day);
}

function createBirthdayEmbed(member) {
  return new EmbedBuilder()
    .setColor('Gold')
    .setTitle(`🎉 יום הולדת שמח ל־${member.displayName}!`)
    .setDescription(`היום ${member} חוגג/ת יום הולדת!\nפרגנו לו בתגובה או תנו ❤️`)
    .setImage(member.user.displayAvatarURL({ extension: 'png', size: 512 }))
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: 'Gamer of the Day • GAMERS UNITED IL' })
    .setTimestamp();
}

async function checkBirthdays(client) {
  const guild = client.guilds.cache.first();
  const channel = guild.channels.cache.get(CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const snapshot = await db.collection('birthdays').get();
  const today = new Date();
  const keyPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  for (const doc of snapshot.docs) {
    const { birthday } = doc.data();
    if (!isTodayBirthday(birthday)) continue;

    const userId = doc.id;
    const logRef = db.collection('birthdayLogs').doc(`${keyPrefix}_${userId}`);
    const logSnap = await logRef.get();
    if (logSnap.exists) continue; // כבר טופל היום

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    await member.roles.add(ROLE_ID).catch(() => {});
    const embed = createBirthdayEmbed(member);

    await channel.send({
      content: `🎂 מזל טוב ל־${member}!\n@everyone`,
      embeds: [embed],
      files: [path.join(__dirname, '../assets/logo.png')]
    });

    await logRef.set({
      status: 'notified',
      guildId: guild.id,
      createdAt: new Date().toISOString()
    });

    // מאזין כניסה לערוץ קול
    const filter = (oldState, newState) =>
      newState.member?.id === userId &&
      !oldState.channelId &&
      newState.channelId;

    const listener = async (oldState, newState) => {
      if (!filter(oldState, newState)) return;

      const audioPath = await synthesizeGoogleTTS(
        `מזל טוב ל־${member.displayName}! שמעון מאחל לך שנה של ניצחונות, פינג נמוך, וקבוצה שלא עוזבת באמצע!`
      );
      const connection = await newState.channel.join();
      const dispatcher = connection.play(audioPath);

      dispatcher.on('finish', () => {
        connection.disconnect();
        fs.unlink(audioPath, () => {});
      });

      client.off('voiceStateUpdate', listener);
      await logRef.set({ status: 'tts_played' }, { merge: true });
    };

    client.on('voiceStateUpdate', listener);

    // אם לא עלה עד 22:00, שלח פינג פומבי
    setTimeout(async () => {
      const voiceMember = guild.members.cache.get(userId);
      if (!voiceMember?.voice?.channel) {
        await channel.send(`${member} 🎤 נו באמת? יום הולדת ולא באת לשמוע את הברכה שלי? יאללה בוא לערוץ!`);
      }
    }, getMsUntil22());
  }
}

function getMsUntil22() {
  const now = new Date();
  const target = new Date();
  target.setHours(22, 0, 0, 0);
  if (now > target) return 0;
  return target - now;
}

function startBirthdayTracker(client) {
  setInterval(() => checkBirthdays(client), 1000 * 60 * 30); // כל 30 דקות
}

module.exports = { startBirthdayTracker };
