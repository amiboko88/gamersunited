// 📁 birthdayTracker.js – גרסה מעודכנת ל־ElevenLabs בלבד
const { EmbedBuilder, ChannelType } = require('discord.js');
const { synthesizeElevenTTS } = require('../tts/ttsEngine.elevenlabs');
const db = require('../utils/firebase');
const { Readable } = require('stream');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus
} = require('@discordjs/voice');

const CHANNEL_ID = process.env.BIRTHDAY_CHANNEL_ID;
const ROLE_ID = process.env.BIRTHDAY_ROLE_ID;

function isTodayBirthday(dateString) {
  const today = new Date();
  const [month, day, year] = dateString.split('-');
  return (
    today.getMonth() + 1 === parseInt(month) &&
    today.getDate() === parseInt(day)
  );
}

function calculateAge(birthday) {
  const [month, day, year] = birthday.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassedThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasBirthdayPassedThisYear) age--;
  return age;
}

function createBirthdayEmbed(member, age) {
  return new EmbedBuilder()
    .setColor('Gold')
    .setTitle(`🎉 יום הולדת שמח ל־${member.displayName}!`)
    .setDescription(`היום ${member} חוגג/ת יום הולדת **${age}** 🎂\nתנו ❤️ או איחול קולני!`)
    .setImage(member.user.displayAvatarURL({ extension: 'png', size: 512 }))
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: 'Gamer of the Day • UNITED IL' })
    .setTimestamp();
}

function getMsUntil22() {
  const now = new Date();
  const target = new Date();
  target.setHours(22, 0, 0, 0);
  if (now > target) return 0;
  return target - now;
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
    if (logSnap.exists) continue;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    const age = calculateAge(birthday);
    await member.roles.add(ROLE_ID).catch(() => {});

    const embed = createBirthdayEmbed(member, age);

    await channel.send({
      content: `🎂 מזל טוב ל־${member} שחוגג/ת **${age}** שנים של עצבים מ־Warzone!\n@everyone`,
      embeds: [embed],
      files: ['assets/logo.png']
    });

    await logRef.set({
      status: 'notified',
      guildId: guild.id,
      createdAt: new Date().toISOString()
    });

    // השמעת ברכה כשעולה לערוץ
    const filter = (oldState, newState) =>
      newState.member?.id === userId &&
      !oldState.channelId &&
      newState.channelId;

    const listener = async (oldState, newState) => {
      if (!filter(oldState, newState)) return;

      const phrase = `מזל טוב ל־${member.displayName}! אתה בן ${age} היום, וזה אומר שאתה עדיין משחק ולא פרשת כמו הגדולים! שנה של ניצחונות, פינג נמוך, וקבוצה שלא נוטשת באמצע.`;
      const buffer = await synthesizeElevenTTS(phrase, 'shimon');

      try {
        const connection = joinVoiceChannel({
          channelId: newState.channelId,
          guildId: newState.guild.id,
          adapterCreator: newState.guild.voiceAdapterCreator
        });

        const resource = createAudioResource(Readable.from(buffer));
        const player = createAudioPlayer();
        connection.subscribe(player);
        player.play(resource);

        await entersState(player, AudioPlayerStatus.Idle, 15000);
        connection.destroy();

        client.off('voiceStateUpdate', listener);
        await logRef.set({ status: 'tts_played' }, { merge: true });
      } catch (err) {
        console.error('שגיאה בהשמעת ברכה:', err.message);
      }
    };

    client.on('voiceStateUpdate', listener);

    // תזכורת אם לא עלה עד 22:00
    setTimeout(async () => {
      const voiceMember = guild.members.cache.get(userId);
      if (!voiceMember?.voice?.channel) {
        await channel.send(`${member} 🎤 יום הולדת ולא באת לשמוע את הברכה שלי?? יאללה תעלה!`);
      }
    }, getMsUntil22());
  }
}

function startBirthdayTracker(client) {
  setInterval(() => checkBirthdays(client), 1000 * 60 * 30); // כל 30 דקות
}

module.exports = { startBirthdayTracker };