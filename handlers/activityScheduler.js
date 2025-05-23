const { TextChannel } = require('discord.js');

const WARZONE_ROLE_ID = process.env.ROLE_WARZONE_ID;
const TARGET_TEXT_CHANNEL_ID = '583575179880431616';

const warzoneMessages = [
  '🔥 יש פה מלחמה או כולם עושים נענע עם פינג 900?',
  '🎯 שלושה שחקני וורזון אונליין ואף אחד לא בערוץ... מעניין 🤨',
  '👀 מישהו אמר Warzone? בואו לערוץ, אולי יקרה קסם!',
  '💀 פינג של אלופים – מי מוכן להתאבד איתי באותו גג?',
  '🚨 ALERT: וורזון און אבל אף אחד לא בסקווד! איפה הכבוד?',
  '😴 כולם מחוברים, אף אחד לא מדבר – זה שרת או בית קברות?',
  '🧱 פינגים גבוהים, מוטיבציה נמוכה – ככה לא בונים חומה!',
  '🎮 אתם לא מחוברים, אתם מחובקנים. בואו לערוץ כבר!',
  '🧠 נוכחות גבוהה, ביצועים נמוכים – קלאסיק של השרת הזה.',
  '🐌 אפילו הדיסקורד מרגיש כמה אתם איטיים היום...',
  '👻 יש פה רוחות רפאים מחופשות לשחקנים. מישהו מוכן להופיע?',
  '📉 המורל בשרת הזה כמו KD שלי – בתחתית.',
  '🏆 אם הייתם משקיעים בקול כמו בבאטל-פס היינו כבר בליגה.',
  '🍗 בואו לערוץ ונעשה לובי, לא על האש. או שכן?',
  '⚔️ שמעון קורא לקרב! תתייצבו או תקבלו כינוי מה-TTS!',
  '📢 מי שמגיע לערוץ עכשיו – מקבל נקודת כבוד. מי שלא – סנקציה!',
  '👨‍👦‍👦 כולם מחוברים אבל מתנהגים כמו סולואים. איפה הקלאן?',
  '😡 אל תגידו לי אח"כ שאין עם מי לשחק. תתחילו להופיע!',
  '🔇 שקט בערוץ = בושה בשרת. תראו מי אתם באמת.',
  '📦 שחקני Warzone על הנייר. בערוץ? נעלמים כמו Supply Drop.',
  '🎤 אחד... שתיים... בדיקה... מישהו פה בכלל משחק או רק צופה ביוטיוב?',
  '💡 רעיון: תתחברו לערוץ ותגידו שלום. לא יקרה כלום, מבטיח.'
];


function getRandomMsg() {
  return warzoneMessages[Math.floor(Math.random() * warzoneMessages.length)];
}

async function checkWarzoneActivity(client) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  await guild.members.fetch();
  const channel = guild.channels.cache.get(TARGET_TEXT_CHANNEL_ID);
  if (!(channel instanceof TextChannel)) return;

  const warzonePlayers = guild.members.cache.filter(m =>
    m.roles.cache.has(WARZONE_ROLE_ID) && !m.user.bot
  );

  const onlineWarzoners = warzonePlayers.filter(m =>
    ['online', 'dnd', 'idle'].includes(m.presence?.status)
  );

  const inVoice = warzonePlayers.filter(m => m.voice?.channel);

  if (onlineWarzoners.size >= 3 && inVoice.size === 0) {
    channel.send(getRandomMsg()).catch(() => {});
  }
}

function startActivityScheduler(client) {
  // רץ כל שעתיים (אפשר לשנות לפי הצורך)
  setInterval(() => {
    checkWarzoneActivity(client);
  }, 1000 * 60 * 60 * 2);
}

module.exports = { startActivityScheduler };
