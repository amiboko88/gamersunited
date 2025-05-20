// 📁 handlers/presenceTracker.js – מערכת תפקידים חכמה ויציבה

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
  return !presence || presence.status === 'offline';
}

async function updateMemberRoles(member, presence) {
  const hasWarzone = isPlayingWarzone(presence);
  const hasSomething = isPlayingSomething(presence);
  const gameActivity = presence?.activities?.find(a => a.type === 0);

  const hasWarzoneRole = member.roles.cache.has(ROLE_WARZONE_ID);
  const hasGenericRole = member.roles.cache.has(ROLE_GENERIC_ID);

  if (isOffline(presence) || !hasSomething) {
    if (hasWarzoneRole) {
      await member.roles.remove(ROLE_WARZONE_ID).then(() => {
        logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
      }).catch(() => {});
    }
    if (hasGenericRole) {
      await member.roles.remove(ROLE_GENERIC_ID).then(() => {
        logRoleChange({ member, action: 'remove', roleName: 'Generic' });
      }).catch(() => {});
    }
    return;
  }

  if (hasWarzone) {
    if (!hasWarzoneRole) {
      await member.roles.add(ROLE_WARZONE_ID).then(() => {
        logRoleChange({ member, action: 'add', roleName: 'Warzone', gameName: gameActivity?.name });
      }).catch(() => {});
    }
    if (hasGenericRole) {
      await member.roles.remove(ROLE_GENERIC_ID).then(() => {
        logRoleChange({ member, action: 'remove', roleName: 'Generic' });
      }).catch(() => {});
    }
  } else {
    if (!hasGenericRole) {
      await member.roles.add(ROLE_GENERIC_ID).then(() => {
        logRoleChange({ member, action: 'add', roleName: 'Generic', gameName: gameActivity?.name });
      }).catch(() => {});
    }
    if (hasWarzoneRole) {
      await member.roles.remove(ROLE_WARZONE_ID).then(() => {
        logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
      }).catch(() => {});
    }
  }
}

// 1. ריצה בלייב
async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;
  await updateMemberRoles(presence.member, presence);
}

// 2. סריקה תקופתית – רק למשתמשים שמחוברים
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

// 3. סנכרון מלא בעת עלייה – כולל Offline
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

// 4. לולאת סריקה חכמה כל 2 דקות
function startPresenceLoop(client) {
  setInterval(() => {
    softPresenceScan(client);
  }, 2 * 60 * 1000); // כל 2 דקות
}

module.exports = {
  trackGamePresence,
  softPresenceScan,
  hardSyncPresenceOnReady,
  startPresenceLoop
};
