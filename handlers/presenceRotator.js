// 📁 handlers/presenceRotator.js

const { ActivityType, MessageFlags } = require('discord.js');

const statuses = [
  { type: ActivityType.Playing, text: 'פיפו עם קרציות 👀' },
  { type: ActivityType.Watching, text: 'מחכה ל-MVP 🏆' },
  { type: ActivityType.Playing, text: 'וורזון – תתחילו כבר 🎮' },
  { type: ActivityType.Playing, text: 'AFK אבל קולט הכל 🕵️‍♂️' },
  { type: ActivityType.Listening, text: 'GG? מי אמר GG? 🎤' },
  { type: ActivityType.Playing, text: 'שקט! ספאם בבוטים 🤫' },
  { type: ActivityType.Playing, text: 'נשואים מתפרקים כאן 💔' },
  { type: ActivityType.Watching, text: 'מי יגיד GG ראשון?' },
  { type: ActivityType.Playing, text: 'ממתין ל־/fifo...' }
];


function startPresenceRotation(client) {
  let index = 0;

function updatePresence() {
  const { type, text } = statuses[index];
  client.user.setActivity(text, { type }); // ✅ בלי catch
  index = (index + 1) % statuses.length;
}

  updatePresence(); // ריצה ראשונית מיידית
  setInterval(updatePresence, 1000 * 60 * 5); // כל 5 דקות
}

module.exports = { startPresenceRotation };
