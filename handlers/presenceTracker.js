const { log, logRoleChange } = require('../utils/logger');

const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty'];
const ROLE_WARZONE_ID = process.env.ROLE_WARZONE_ID;
const ROLE_GENERIC_ID = process.env.ROLE_GENERIC_ID;

function isPlayingWarzone(presence) {
  const game = presence?.activities?.find(a => a.type === 0);
  return game && WARZONE_KEYWORDS.some(k =>
    game.name?.toLowerCase().includes(k.toLowerCase())
  );
}

function isPlayingSomething(presence) {
  return presence?.activities?.some(a => a.type === 0);
}

function getGameName(presence) {
  return presence?.activities?.find(a => a.type === 0)?.name || 'לא ידוע';
}

function isOffline(status) {
  return status === 'offline' || status === 'invisible';
}

async function handleMemberPresence(member, presence) {
  const hasWZ = member.roles.cache.has(ROLE_WARZONE_ID);
  const hasGEN = member.roles.cache.has(ROLE_GENERIC_ID);

  const status = presence?.status || 'offline';
  const isAny = isPlayingSomething(presence);
  const isWZ = isPlayingWarzone(presence);
  const gameName = getGameName(presence);

  // ❌ לא משחק או offline
  if (!isAny || isOffline(status)) {
    if (hasWZ) {
      const before = member.roles.cache.has(ROLE_WARZONE_ID);
      await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
      const after = member.roles.cache.has(ROLE_WARZONE_ID);
      if (before && !after) {
        logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
      }
    }
    if (hasGEN) {
      const before = member.roles.cache.has(ROLE_GENERIC_ID);
      await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
      const after = member.roles.cache.has(ROLE_GENERIC_ID);
      if (before && !after) {
        logRoleChange({ member, action: 'remove', roleName: 'Generic' });
      }
    }
    return;
  }

  // ✅ משחק Warzone
  if (isWZ) {
    if (!hasWZ) {
      const before = member.roles.cache.has(ROLE_WARZONE_ID);
      await member.roles.add(ROLE_WARZONE_ID).catch(() => {});
      const after = member.roles.cache.has(ROLE_WARZONE_ID);
      if (!before && after) {
        logRoleChange({ member, action: 'add', roleName: 'Warzone', gameName });
      }
    }
    if (hasGEN) {
      const before = member.roles.cache.has(ROLE_GENERIC_ID);
      await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
      const after = member.roles.cache.has(ROLE_GENERIC_ID);
      if (before && !after) {
        logRoleChange({ member, action: 'remove', roleName: 'Generic' });
      }
    }
    return;
  }

  // 🎮 משחק אחר (לא Warzone)
  if (!hasGEN) {
    const before = member.roles.cache.has(ROLE_GENERIC_ID);
    await member.roles.add(ROLE_GENERIC_ID).catch(() => {});
    const after = member.roles.cache.has(ROLE_GENERIC_ID);
    if (!before && after) {
      logRoleChange({ member, action: 'add', roleName: 'Generic', gameName });
    }
  }

  if (hasWZ) {
    const before = member.roles.cache.has(ROLE_WARZONE_ID);
    await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
    const after = member.roles.cache.has(ROLE_WARZONE_ID);
    if (before && !after) {
      logRoleChange({ member, action: 'remove', roleName: 'Warzone' });
    }
  }
}

// 🎯 משמש ל־presenceUpdate
async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;
  await handleMemberPresence(presence.member, presence);
}

// 🟢 סריקה ראשונית לאחר עלייה
async function hardSyncPresenceOnReady(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch({ withPresences: true });
    } catch (err) {
      log(`⚠️ לא ניתן לטעון את כל המשתמשים בשרת: ${guild.name}`);
    }

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      await handleMemberPresence(member, member.presence);
    }
  }
}

// ⏱️ סריקה מחזורית כל 5 דקות
async function startPresenceLoop(client) {
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;
        await handleMemberPresence(member, member.presence);
      }
    }
  }, 5 * 60 * 1000);
}

module.exports = {
  trackGamePresence,
  hardSyncPresenceOnReady,
  startPresenceLoop
};
