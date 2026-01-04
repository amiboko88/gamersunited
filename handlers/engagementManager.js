// 📁 handlers/engagementManager.js
const { getUserRef } = require('../utils/userUtils'); // ✅
const { MessageFlags } = require('discord.js');

const LEVEL_FORMULA = level => 5 * (level ** 2) + 50 * level + 100;
const COOLDOWN_SECONDS = 60; 
const lastMessageTimestamps = new Map();

async function handleXPMessage(message) {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const now = Date.now();
  const cooldownKey = `${message.guild.id}-${userId}`;

  // מניעת ספאם (Cooldown)
  if (lastMessageTimestamps.has(cooldownKey)) {
    const last = lastMessageTimestamps.get(cooldownKey);
    if ((now - last) / 1000 < COOLDOWN_SECONDS) return;
  }
  lastMessageTimestamps.set(cooldownKey, now);

  const charCount = message.content.length;
  const xpGain = Math.floor(charCount / 10) + 5; 

  const userRef = await getUserRef(userId, 'discord');
  
  try {
      // שימוש בטרנזקציה לעדכון אטומי
      await userRef.firestore.runTransaction(async (t) => {
          const doc = await t.get(userRef);
          if (!doc.exists) return; // משתמש אמור להיווצר בכניסה לשרת, לא כאן

          const data = doc.data();
          const economy = data.economy || { xp: 0, level: 1, balance: 0 };
          
          let { xp, level } = economy;
          xp += xpGain;

          const nextLevelXp = LEVEL_FORMULA(level);
          let leveledUp = false;

          while (xp >= nextLevelXp) {
              xp -= nextLevelXp;
              level++;
              leveledUp = true;
          }

          // עדכון ב-DB המאוחד
          t.update(userRef, {
              'economy.xp': xp, 
              'economy.level': level,
              'stats.messagesSent': (data.stats?.messagesSent || 0) + 1,
              'meta.lastActive': new Date().toISOString()
          });

          if (leveledUp) {
              const channel = message.channel;
              // שליחת הודעת עליית רמה (אפשר לשדרג לתמונה בעתיד)
              await channel.send({ 
                  content: `🎉 **${message.author}** עלה לרמה **${level}**!`,
                  flags: MessageFlags.SuppressNotifications
              });
          }
      });
  } catch (error) {
      console.error('XP Update Error:', error);
  }
}

module.exports = { handleXPMessage };