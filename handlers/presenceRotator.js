// 📁 handlers/presenceRotator.js

const { ActivityType } = require('discord.js');

const statuses = [
  { type: ActivityType.Playing, text: 'פיפו עם שחקנים מבולבלים 🎮' },
  { type: ActivityType.Listening, text: 'לצרחות בוורזון 🎧' },
  { type: ActivityType.Watching, text: 'מי עוזב ערוץ הפעם...' },
  { type: ActivityType.Playing, text: '/פיפו עם 3 בקבוצה' },
  { type: ActivityType.Listening, text: 'לתירוצים של שחקנים' },
  { type: ActivityType.Competing, text: 'על תואר ה-MVP 🏆' },
  { type: ActivityType.Watching, text: 'מי שותק בערוץ 🤫' },
  { type: ActivityType.Playing, text: 'וורזון עד השעות הקטנות' }
];

function startPresenceRotation(client) {
  let index = 0;

  const updatePresence = () => {
    const { type, text } = statuses[index];
    client.user.setActivity(text, { type }).catch(() => {});
    index = (index + 1) % statuses.length;
  };

  updatePresence(); // ריצה ראשונית מיידית
  setInterval(updatePresence, 1000 * 60 * 5); // כל 5 דקות
}

module.exports = { startPresenceRotation };
