// 📁 handlers/birthdayTracker.js
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

const birthdayMessages = [
  age => `עוד שנה של ניצחונות, rage quit וחברים שנוטשים באמצע 🎮 (גיל ${age})`,
  age => `כמו יין טוב – משתבח בטירוף. שנה של קלאצ'ים והרבה 💣 (בן ${age})`,
  age => `גיל ${age} זה בדיוק הזמן לפרוש… או לא 😏`,
  age => `לחגוג אותך זו משימה פשוטה – רק תעלה לקול ונברך אותך 🎙️`,
  age => `שתזכה לפינג נמוך, קבוצה טובה, ואוזניות שלא מקרטעות 🎧 (גיל ${age})`
];

function isTodayBirthday(birthday) {
  const today = new Date();
  return (
    birthday?.day === today.getDate() &&
    birthday?.month === today.getMonth() + 1
  );
}

function calculateAge(birthday) {
  const birthDate = new Date(birthday.year, birthday.month - 1, birthday.day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasPassed) age--;
  return age;
}

function createBirthdayEmbed(member, age) {
  const random = birthdayMessages[Math.floor(Math.random() * birthdayMessages.length)];
  const message = random(age);

  return new EmbedBuilder()
    .setColor('Gold')
    .setTitle(`🎉 יום הולדת שמח ל־${member.displayName}!`)
    .setDescription(`**${message}**\n\n🎈 תנו ❤️, תגידו מילה טובה, או פשוט תעלו לקול 🎤`)
    .setImage(member.user.displayAvatarURL({ size: 1024 }))
    .setThumbnail('attachment://logo.png')
    .setFooter({ text: 'Gamer of the Day • UNITED IL' })
    .setTimestamp();
}

function getMsUntil22() {
  const now = new Date();
  const target = new Date();
  target.setHours(22, 0, 0, 0);
  return now > target ? 0 : target - now;
}

async function checkBirthdays(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  const channel = guild.channels.cache.get(CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const snapshot = await db.collection('birthdays').get();
  const today = new Date();
  const keyPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const seenDiscordIds = new Set();

  for (const doc of snapshot.docs) {
    const { birthday, linkedAccounts = [] } = doc.data();
    const discordId = linkedAccounts.find(id => id.startsWith('discord:'))?.split(':')[1];
    if (!birthday || !isTodayBirthday(birthday) || !discordId || seenDiscordIds.has(discordId)) continue;

    seenDiscordIds.add(discordId);

    const logRef = db.collection('birthdayLogs').doc(`${keyPrefix}_${discordId}`);
    const logSnap = await logRef.get();
    if (logSnap.exists) continue;

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) continue;

    const age = calculateAge(birthday);
    await member.roles.add(ROLE_ID).catch(() => {});

    const embed = createBirthdayEmbed(member, age);

    await channel.send({
      content: `@everyone 🎂 מזל טוב ל־${member} שחוגג/ת **${age}** שנים של עצבים מ־Warzone!`,
      embeds: [embed],
      files: ['assets/logo.png']
    });

    await logRef.set({
      status: 'notified',
      guildId: guild.id,
      createdAt: new Date().toISOString()
    });

    // TTS 🎙️
    const listener = async (oldState, newState) => {
      if (newState.member?.id === discordId && !oldState.channelId && newState.channelId) {
        const ttsMessages = [
          ({ name, age }) => `מזל טוב ל־${name}! אתה בן ${age} היום, וזה אומר שאתה עדיין משחק ולא פרשת כמו הגדולים!`,
          ({ name, age }) => `${name}, ${age} שנה שאתה מחזיק שליטה – אולי השנה תלמד גם להרים קבוצה?`,
          ({ name, age }) => `היי ${name}, בגיל ${age} כבר מגיעה לך קבוצה קבועה ו־ping יציב. יאללה תעשה סדר!`,
          ({ name, age }) => `יום הולדת שמח ${name}! גיל ${age} זה בדיוק הזמן לפרוש… סתם, תישאר איתנו 🎉`,
          ({ name, age }) => `וואו ${name}, ${age} שנה ואתה עדיין rage quit כל סיבוב? חוגגים אותך בכל זאת!`
        ];

        const phrase = ttsMessages[Math.floor(Math.random() * ttsMessages.length)]({ name: member.displayName, age });
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
      }
    };

    client.on('voiceStateUpdate', listener);

    // תזכורת אם לא עלה לקול עד 22:00
    setTimeout(async () => {
      const voiceMember = guild.members.cache.get(discordId);
      if (!voiceMember?.voice?.channel) {
        await channel.send(`${member} 🎤 יום הולדת ולא באת לשמוע את הברכה שלי?? יאללה תעלה!`);
      }
    }, getMsUntil22());
  }
}

// ייצוא הפונקציה המרכזית בלבד, ללא תזמון
module.exports = { checkBirthdays };