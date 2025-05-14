const { log } = require('../utils/logger');

const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty'];
const ROLE_WARZONE_ID = process.env.ROLE_WARZONE_ID;
const ROLE_GENERIC_ID = process.env.ROLE_GENERIC_ID;

// 🎮 מאזין לכל שינוי במשחקים
async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;

  const member = presence.member;
  const activities = presence.activities || [];
  const gameActivity = activities.find(act => act.type === 0);
  const username = member.displayName;

  const hasWarzone = gameActivity && WARZONE_KEYWORDS.some(keyword =>
    gameActivity.name?.toLowerCase().includes(keyword.toLowerCase())
  );

  const roleWarzone = ROLE_WARZONE_ID && member.guild.roles.cache.get(ROLE_WARZONE_ID);
  const roleGeneric = ROLE_GENERIC_ID && member.guild.roles.cache.get(ROLE_GENERIC_ID);

  if (!gameActivity) {
    if (roleWarzone && member.roles.cache.has(roleWarzone.id)) {
      await member.roles.remove(roleWarzone).catch(() => {});
      log(`❌ ${username} הפסיק לשחק – תפקיד WARZONE הוסר`);
    }
    if (roleGeneric && member.roles.cache.has(roleGeneric.id)) {
      await member.roles.remove(roleGeneric).catch(() => {});
      log(`❌ ${username} הפסיק לשחק – תפקיד 🎮 הוסר`);
    }
    return;
  }

  if (hasWarzone) {
    if (roleWarzone && !member.roles.cache.has(roleWarzone.id)) {
      await member.roles.add(roleWarzone).catch(() => {});
      log(`🔥 ${username} התחיל לשחק Warzone – קיבל תפקיד WARZONE`);
    }
    if (roleGeneric && member.roles.cache.has(roleGeneric.id)) {
      await member.roles.remove(roleGeneric).catch(() => {});
    }
  } else {
    if (roleGeneric && !member.roles.cache.has(roleGeneric.id)) {
      await member.roles.add(roleGeneric).catch(() => {});
      log(`🎮 ${username} משחק משהו אחר – קיבל תפקיד 🎮`);
    }
    if (roleWarzone && member.roles.cache.has(roleWarzone.id)) {
      await member.roles.remove(roleWarzone).catch(() => {});
    }
  }
}

// 🎯 בעת עליית הבוט – סורק את כל המשתמשים
async function validatePresenceOnReady(client) {
  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch();

    const roleWarzone = ROLE_WARZONE_ID && guild.roles.cache.get(ROLE_WARZONE_ID);
    const roleGeneric = ROLE_GENERIC_ID && guild.roles.cache.get(ROLE_GENERIC_ID);

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;

      const activities = member.presence?.activities || [];
      const gameActivity = activities.find(act => act.type === 0);
      const username = member.displayName;

      const hasWarzone = gameActivity && WARZONE_KEYWORDS.some(keyword =>
        gameActivity.name?.toLowerCase().includes(keyword.toLowerCase())
      );

      if (!gameActivity) {
        if (roleWarzone && member.roles.cache.has(roleWarzone.id)) {
          await member.roles.remove(roleWarzone).catch(() => {});
          log(`❌ ${username} לא משחק – WARZONE הוסר`);
        }
        if (roleGeneric && member.roles.cache.has(roleGeneric.id)) {
          await member.roles.remove(roleGeneric).catch(() => {});
          log(`❌ ${username} לא משחק – 🎮 הוסר`);
        }
      } else if (hasWarzone) {
        if (roleWarzone && !member.roles.cache.has(roleWarzone.id)) {
          await member.roles.add(roleWarzone).catch(() => {});
          log(`🔥 ${username} כבר בתוך Warzone – קיבל תפקיד WARZONE`);
        }
        if (roleGeneric && member.roles.cache.has(roleGeneric.id)) {
          await member.roles.remove(roleGeneric).catch(() => {});
        }
      } else {
        if (roleGeneric && !member.roles.cache.has(roleGeneric.id)) {
          await member.roles.add(roleGeneric).catch(() => {});
          log(`🎮 ${username} פעיל במשחק אחר – קיבל 🎮`);
        }
        if (roleWarzone && member.roles.cache.has(roleWarzone.id)) {
          await member.roles.remove(roleWarzone).catch(() => {});
        }
      }
    }
  }
}

module.exports = {
  trackGamePresence,
  validatePresenceOnReady
};
