const { log, logRoleChange } = require('../utils/logger');

const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty'];
const ROLE_WARZONE_ID = process.env.ROLE_WARZONE_ID;
const ROLE_GENERIC_ID = process.env.ROLE_GENERIC_ID;

function isPlayingWarzone(presence) {
  const gameActivity = presence?.activities?.find(a => a.type === 0);
  return gameActivity && WARZONE_KEYWORDS.some(keyword =>
    gameActivity.name?.toLowerCase().includes(keyword.toLowerCase())
  );
}

function isPlayingSomething(presence) {
  return presence?.activities?.some(a => a.type === 0);
}

function isOffline(presence) {
  return !presence || presence.status === 'offline' || presence.status === 'invisible';
}

const recentLogMap = new Map();

function shouldLog(memberId, roleName, gameName) {
  const key = `${memberId}-${roleName}-${gameName || ''}`;
  const now = Date.now();
  const last = recentLogMap.get(key) || 0;

  if (now - last < 10 * 60 * 1000) return false;
  recentLogMap.set(key, now);
  return true;
}

async function updateMemberRoles(member, presence) {
  const hasSomething = isPlayingSomething(presence);
  const hasWarzone = isPlayingWarzone(presence);
  const gameActivity = presence?.activities?.find(a => a.type === 0);
  const gameName = gameActivity?.name || '';

  const hasWarzoneRole = member.roles.cache.has(ROLE_WARZONE_ID);
  const hasGenericRole = member.roles.cache.has(ROLE_GENERIC_ID);

  // ❌ לא משחק כלום או offline – הסר הכל
  if (!hasSomething || isOffline(presence)) {
    if (hasWarzoneRole) {
      const removed = await member.roles.remove(ROLE_WARZONE_ID).catch(() => null);
      if (removed && shouldLog(member.id, 'Warzone')) {
        logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
      }
    }

    if (hasGenericRole) {
      const removed = await member.roles.remove(ROLE_GENERIC_ID).catch(() => null);
      if (removed && shouldLog(member.id, 'Generic')) {
        logRoleChange({ member, action: 'remove', roleName: 'Generic' });
      }
    }

    return;
  }

  // ✅ משחק Warzone
  if (hasWarzone) {
    if (!hasWarzoneRole) {
      const added = await member.roles.add(ROLE_WARZONE_ID).catch(() => null);
      if (added && shouldLog(member.id, 'Warzone', gameName)) {
        logRoleChange({ member, action: 'add', roleName: 'Warzone', gameName });
      }
    }

    if (hasGenericRole) {
      const removed = await member.roles.remove(ROLE_GENERIC_ID).catch(() => null);
      if (removed && shouldLog(member.id, 'Generic')) {
        logRoleChange({ member, action: 'remove', roleName: 'Generic' });
      }
    }

  } else {
    // ✅ משחק אחר
    if (!hasGenericRole) {
      const added = await member.roles.add(ROLE_GENERIC_ID).catch(() => null);
      if (added && shouldLog(member.id, 'Generic', gameName)) {
        logRoleChange({ member, action: 'add', roleName: 'Generic', gameName });
      }
    }

    if (hasWarzoneRole) {
      const removed = await member.roles.remove(ROLE_WARZONE_ID).catch(() => null);
      if (removed && shouldLog(member.id, 'Warzone')) {
        logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
      }
    }
  }
}

// 🔁 אירוע חי
async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;
  await updateMemberRoles(presence.member, presence);
}

// ⏱️ כל 2 דקות
async function softPresenceScan(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      const presence = member.presence;
      if (!presence) continue;
      await updateMemberRoles(member, presence);
    }
  }
}

// 🛫 בעלייה
async function hardSyncPresenceOnReady(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch();
    } catch (err) {
      if (err.code === 'GuildMembersTimeout') {
        log(`⚠️ לא ניתן לטעון את כל המשתמשים בשרת: ${guild.name} – ${err.code}`);
      } else {
        log(`❌ שגיאה כללית בטעינת משתמשים לשרת: ${guild.name}`);
        console.error(err);
      }
    }

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      const presence = member.presence;
      await updateMemberRoles(member, presence);
    }
  }
}

// 🌀 ריצה אוטומטית
function startPresenceLoop(client) {
  setInterval(() => {
    softPresenceScan(client);
  }, 2 * 60 * 1000);
}

module.exports = {
  trackGamePresence,
  softPresenceScan,
  hardSyncPresenceOnReady,
  startPresenceLoop
};
