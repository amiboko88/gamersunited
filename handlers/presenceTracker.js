const { log, logRoleChange } = require('../utils/logger');

const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty'];
const ROLE_WARZONE_ID = process.env.ROLE_WARZONE_ID;
const ROLE_GENERIC_ID = process.env.ROLE_GENERIC_ID;

// 🧠 למניעת לוגים כפולים
const recentLogs = new Map();

function isOffline(status) {
  return status === 'offline' || status === 'invisible';
}

function isPlaying(presence) {
  return presence?.activities?.some(a => a.type === 0);
}

function isPlayingWarzone(presence) {
  const game = presence?.activities?.find(a => a.type === 0);
  return game && WARZONE_KEYWORDS.some(k =>
    game.name?.toLowerCase().includes(k.toLowerCase())
  );
}

function getGameName(presence) {
  return presence?.activities?.find(a => a.type === 0)?.name || 'לא ידוע';
}

function shouldLog(userId, role, type) {
  const key = `${userId}-${role}-${type}`;
  const now = Date.now();
  const last = recentLogs.get(key) || 0;
  if (now - last < 5 * 60 * 1000) return false;
  recentLogs.set(key, now);
  return true;
}

// 🔁 עדכון חכם בזמן אמת
async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;

  const member = presence.member;
  const status = presence.status;
  const isWZ = isPlayingWarzone(presence);
  const isAny = isPlaying(presence);
  const gameName = getGameName(presence);

  const hasWZ = member.roles.cache.has(ROLE_WARZONE_ID);
  const hasGEN = member.roles.cache.has(ROLE_GENERIC_ID);

  if (!isAny || isOffline(status)) {
    if (hasWZ) {
      await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
      if (shouldLog(member.id, 'Warzone', 'remove')) {
        logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
      }
    }
    if (hasGEN) {
      await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
      if (shouldLog(member.id, 'Generic', 'remove')) {
        logRoleChange({ member, action: 'remove', roleName: 'Generic' });
      }
    }
    return;
  }

  if (isWZ) {
    if (!hasWZ) {
      await member.roles.add(ROLE_WARZONE_ID).catch(() => {});
      if (shouldLog(member.id, 'Warzone', 'add')) {
        logRoleChange({ member, action: 'add', roleName: 'Warzone', gameName });
      }
    }
    if (hasGEN) {
      await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
      if (shouldLog(member.id, 'Generic', 'remove')) {
        logRoleChange({ member, action: 'remove', roleName: 'Generic' });
      }
    }
    return;
  }

  if (!hasGEN) {
    await member.roles.add(ROLE_GENERIC_ID).catch(() => {});
    if (shouldLog(member.id, 'Generic', 'add')) {
      logRoleChange({ member, action: 'add', roleName: 'Generic', gameName });
    }
  }

  if (hasWZ) {
    await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
    if (shouldLog(member.id, 'Warzone', 'remove')) {
      logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
    }
  }
}

// 🛫 בעת עלייה – גם למי שאין presence
async function hardSyncPresenceOnReady(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch({ withPresences: true });
    } catch (err) {
      log(`⚠️ לא ניתן לטעון את כל המשתמשים בשרת: ${guild.name}`);
    }

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;

      const presence = member.presence;
      const hasWZ = member.roles.cache.has(ROLE_WARZONE_ID);
      const hasGEN = member.roles.cache.has(ROLE_GENERIC_ID);

      if (presence) {
        await trackGamePresence(presence);
      } else {
        if (hasWZ) {
          await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
          if (shouldLog(member.id, 'Warzone', 'remove')) {
            logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
          }
        }
        if (hasGEN) {
          await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
          if (shouldLog(member.id, 'Generic', 'remove')) {
            logRoleChange({ member, action: 'remove', roleName: 'Generic' });
          }
        }
      }
    }
  }
}

// 🕓 כל שעה – גם מוסיף תפקידים אם צריך
async function startPresenceLoop(client) {
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;

        const presence = member.presence;
        const status = presence?.status || 'offline';
        const isAny = isPlaying(presence);
        const isWZ = isPlayingWarzone(presence);
        const gameName = getGameName(presence);

        const hasWZ = member.roles.cache.has(ROLE_WARZONE_ID);
        const hasGEN = member.roles.cache.has(ROLE_GENERIC_ID);

        if (!isAny || isOffline(status)) {
          if (hasWZ) {
            await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
            if (shouldLog(member.id, 'Warzone', 'remove')) {
              logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
            }
          }
          if (hasGEN) {
            await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
            if (shouldLog(member.id, 'Generic', 'remove')) {
              logRoleChange({ member, action: 'remove', roleName: 'Generic' });
            }
          }
          continue;
        }

        if (isWZ && !hasWZ) {
          await member.roles.add(ROLE_WARZONE_ID).catch(() => {});
          if (shouldLog(member.id, 'Warzone', 'add')) {
            logRoleChange({ member, action: 'add', roleName: 'Warzone', gameName });
          }
          if (hasGEN) {
            await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
            if (shouldLog(member.id, 'Generic', 'remove')) {
              logRoleChange({ member, action: 'remove', roleName: 'Generic' });
            }
          }
          continue;
        }

        if (!isWZ && isAny && !hasGEN) {
          await member.roles.add(ROLE_GENERIC_ID).catch(() => {});
          if (shouldLog(member.id, 'Generic', 'add')) {
            logRoleChange({ member, action: 'add', roleName: 'Generic', gameName });
          }
          if (hasWZ) {
            await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
            if (shouldLog(member.id, 'Warzone', 'remove')) {
              logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
            }
          }
        }
      }
    }
  }, 60 * 60 * 1000); // כל שעה
}

module.exports = {
  trackGamePresence,
  hardSyncPresenceOnReady,
  startPresenceLoop
};
