const { log, logRoleChange } = require('../utils/logger');

const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty'];

const ROLE_WARZONE_ID = process.env.ROLE_WARZONE_ID;
const ROLE_GENERIC_ID = process.env.ROLE_GENERIC_ID;

const roleNameById = {
  [ROLE_WARZONE_ID]: '🎮 Warzone',
  [ROLE_GENERIC_ID]: '🕹️ Generic'
};

async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;

  const member = presence.member;
  const activities = presence.activities || [];
  const gameActivity = activities.find(act => act.type === 0);

  const gameName = gameActivity?.name || null;
  const hasWarzone = gameActivity && WARZONE_KEYWORDS.some(keyword =>
    gameActivity.name?.toLowerCase().includes(keyword.toLowerCase())
  );

  if (!gameActivity) {
    if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
      await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
      logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_WARZONE_ID] });
    }
    if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
      await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
      logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_GENERIC_ID] });
    }
    return;
  }

  if (hasWarzone) {
    if (ROLE_WARZONE_ID && !member.roles.cache.has(ROLE_WARZONE_ID)) {
      await member.roles.add(ROLE_WARZONE_ID).catch(() => {});
      logRoleChange({ member, action: 'add', roleName: roleNameById[ROLE_WARZONE_ID], gameName });
    }
    if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
      await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
      logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_GENERIC_ID] });
    }
  } else {
    if (ROLE_GENERIC_ID && !member.roles.cache.has(ROLE_GENERIC_ID)) {
      await member.roles.add(ROLE_GENERIC_ID).catch(() => {});
      logRoleChange({ member, action: 'add', roleName: roleNameById[ROLE_GENERIC_ID], gameName });
    }
    if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
      await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
      logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_WARZONE_ID] });
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

      const presence = member.presence;

      if (!presence || presence.status === 'offline') {
        if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
          await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
          logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_WARZONE_ID] });
        }
        if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
          await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
          logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_GENERIC_ID] });
        }
        continue;
      }

      const activities = presence.activities || [];
      const gameActivity = activities.find(act => act.type === 0);
      const gameName = gameActivity?.name || null;
      const hasWarzone = gameActivity && WARZONE_KEYWORDS.some(keyword =>
        gameActivity.name?.toLowerCase().includes(keyword.toLowerCase())
      );

      if (!gameActivity) {
        if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
          await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
          logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_WARZONE_ID] });
        }
        if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
          await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
          logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_GENERIC_ID] });
        }
      } else if (hasWarzone) {
        if (ROLE_WARZONE_ID && !member.roles.cache.has(ROLE_WARZONE_ID)) {
          await member.roles.add(ROLE_WARZONE_ID).catch(() => {});
          logRoleChange({ member, action: 'add', roleName: roleNameById[ROLE_WARZONE_ID], gameName });
        }
        if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
          await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
          logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_GENERIC_ID] });
        }
      } else {
        if (ROLE_GENERIC_ID && !member.roles.cache.has(ROLE_GENERIC_ID)) {
          await member.roles.add(ROLE_GENERIC_ID).catch(() => {});
          logRoleChange({ member, action: 'add', roleName: roleNameById[ROLE_GENERIC_ID], gameName });
        }
        if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
          await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
          logRoleChange({ member, action: 'remove', roleName: roleNameById[ROLE_WARZONE_ID] });
        }
      }
    }
  }
}

module.exports = {
  trackGamePresence,
  validatePresenceOnReady
};
