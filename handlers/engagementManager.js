// 📁 handlers/engagementManager.js - מערכת XP ורמות מאוחדת
const { getUserRef } = require('../utils/userUtils');
const { MessageFlags } = require('discord.js');
const Canvas = require('canvas');

const LEVEL_FORMULA = level => 5 * (level ** 2) + 50 * level + 100;
const COOLDOWN_SECONDS = 60; 
const lastMessageTimestamps = new Map();

async function handleXPMessage(message) {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const now = Date.now();
  const cooldownKey = `${message.guild.id}-${userId}`;

  // בדיקת Cooldown
  if (lastMessageTimestamps.has(cooldownKey)) {
    const last = lastMessageTimestamps.get(cooldownKey);
    if ((now - last) / 1000 < COOLDOWN_SECONDS) return;
  }
  lastMessageTimestamps.set(cooldownKey, now);

  // חישוב XP
  const charCount = message.content.length;
  const xpGain = Math.floor(charCount / 10) + 5; // בונוס קבוע + אורך הודעה

  const userRef = await getUserRef(userId, 'discord');
  
  // שימוש ב-Transaction כדי להבטיח עליית רמה מדויקת
  try {
      await userRef.firestore.runTransaction(async (t) => {
          const doc = await t.get(userRef);
          if (!doc.exists) return; // משתמש ייווצר באירוע אחר, לא פה

          const data = doc.data();
          const economy = data.economy || { xp: 0, level: 1, balance: 0 };
          
          let { xp, level } = economy;
          xp += xpGain;

          // לוגיקת עליית רמה
          const nextLevelXp = LEVEL_FORMULA(level);
          let leveledUp = false;

          // בדיקה אם עבר את הסף לרמה הבאה
          // הערה: בגלל המיגרציה, ייתכן שיש משתמשים עם המון XP ורמה נמוכה.
          // הלולאה הזו תסדר אותם.
          while (xp >= nextLevelXp) {
              xp -= nextLevelXp; // איפוס הבר לרמה הבאה (צבירה יחסית)
              level++;
              leveledUp = true;
          }

          t.update(userRef, {
              'economy.xp': xp, 
              'economy.level': level,
              'stats.messagesSent': (data.stats?.messagesSent || 0) + 1
          });

          if (leveledUp) {
              try {
                  await message.channel.send(`🎉 **${message.author} עלה לרמה ${level}!** כל הכבוד! 🆙`);
              } catch (e) {
                  console.error('Failed to send level up message');
              }
          }
      });
  } catch (e) {
      console.error('XP Transaction Error:', e);
  }
}

module.exports = { handleXPMessage, LEVEL_FORMULA };