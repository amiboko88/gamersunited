// 📁 handlers/presenceTracker.js – מערכת תפקידים חכמה ויציבה
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

  const hasWarzoneRole = member.roles.cache.has(ROLE_WARZONE_ID);
  const hasGenericRole = member.roles.cache.has(ROLE_GENERIC_ID);

  if (isOffline(presence) || !hasSomething) {
    if (hasWarzoneRole) await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
    if (hasGenericRole) await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
    return;
  }

  if (hasWarzone) {
    if (!hasWarzoneRole) await member.roles.add(ROLE_WARZONE_ID).catch(() => {});
    if (hasGenericRole) await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
  } else {
    if (!hasGenericRole) await member.roles.add(ROLE_GENERIC_ID).catch(() => {});
    if (hasWarzoneRole) await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
  }
}

// 1. ריצה בלייב
async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;
  await updateMemberRoles(presence.member, presence);
}

// 2. סריקה תקופתית רק למחוברים
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

// 3. ריצה מלאה בעת עלייה – כולל offline
async function hardSyncPresenceOnReady(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch();
    } catch (_) {}

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      const presence = member.presence;
      await updateMemberRoles(member, presence);
    }
  }
}

module.exports = {
  trackGamePresence,
  softPresenceScan,
  hardSyncPresenceOnReady
};
