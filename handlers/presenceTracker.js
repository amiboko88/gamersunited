const { log } = require('../utils/logger');

const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty'];

const ROLE_WARZONE_ID = process.env.ROLE_WARZONE_ID;
const ROLE_GENERIC_ID = process.env.ROLE_GENERIC_ID;

const timeoutErrors = new Map(); // <guildId, lastErrorTimestamp>

async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;

  const member = presence.member;
  const activities = presence.activities || [];
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
    return;
  }

  if (hasWarzone) {
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

async function validatePresenceOnReady(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch({ time: 15000 });
    } catch (err) {
      const now = Date.now();
      const lastError = timeoutErrors.get(guild.id) || 0;

      if (err.code === 'GuildMembersTimeout') {
        if (now - lastError > 1000 * 60 * 30) {
          log(`⚠️ לא ניתן לטעון את כל המשתמשים בשרת: ${guild.name} – ${err.code}`);
          timeoutErrors.set(guild.id, now);
        }
      } else {
        log(`❌ שגיאה כללית בטעינת משתמשים לשרת: ${guild.name}`);
        console.error(err);
      }
    }

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;

      const presence = member.presence;
      if (!presence || presence.status === 'offline') {
        if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
          await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
        }
        if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
          await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
        }
        continue;
      }

      const activities = presence.activities || [];
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
