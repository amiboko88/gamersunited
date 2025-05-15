const { log } = require('../utils/logger');

const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty'];

const ROLE_WARZONE_ID = process.env.ROLE_WARZONE_ID;
const ROLE_GENERIC_ID = process.env.ROLE_GENERIC_ID;

async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;

  const member = presence.member;
  const activities = presence.activities || [];
  const gameActivity = activities.find(act => act.type === 0); // Playing

  const hasWarzone = gameActivity && WARZONE_KEYWORDS.some(keyword =>
    gameActivity.name?.toLowerCase().includes(keyword.toLowerCase())
  );

  // אם הפסיק לשחק – הסרת תפקידים
  if (!gameActivity) {
    if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
      await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
    }
    if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
      await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
    }
    return;
  }

  // משחק WARZONE
  if (hasWarzone) {
    if (ROLE_WARZONE_ID && !member.roles.cache.has(ROLE_WARZONE_ID)) {
      await member.roles.add(ROLE_WARZONE_ID).catch(() => {});
    }
    if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
      await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
    }
  } else {
    // משחק אחר
    if (ROLE_GENERIC_ID && !member.roles.cache.has(ROLE_GENERIC_ID)) {
      await member.roles.add(ROLE_GENERIC_ID).catch(() => {});
    }
    if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
      await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
    }
  }
}

async function validatePresenceOnReady(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch({ time: 15000 });
    } catch (err) {
      log(`⚠️ לא ניתן לטעון את כל המשתמשים בשרת: ${guild.name} – ${err.code}`);
    }

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;

      const activities = member.presence?.activities || [];
      const gameActivity = activities.find(act => act.type === 0);
      const hasWarzone = gameActivity && WARZONE_KEYWORDS.some(keyword =>
        gameActivity.name?.toLowerCase().includes(keyword.toLowerCase())
      );

      if (!gameActivity) {
        if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
          await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
        }
        if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
          await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
        }
      } else if (hasWarzone) {
        if (ROLE_WARZONE_ID && !member.roles.cache.has(ROLE_WARZONE_ID)) {
          await member.roles.add(ROLE_WARZONE_ID).catch(() => {});
        }
        if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
          await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
        }
      } else {
        if (ROLE_GENERIC_ID && !member.roles.cache.has(ROLE_GENERIC_ID)) {
          await member.roles.add(ROLE_GENERIC_ID).catch(() => {});
        }
        if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
          await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
        }
      }
    }
  }
}

module.exports = {
  trackGamePresence,
  validatePresenceOnReady
};
