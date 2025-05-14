const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty'];
const ROLE_WARZONE = 'WARZONE';
const ROLE_GENERIC = '🎮';

// מאזין לשינויים
async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;

  const member = presence.member;
  const activities = presence.activities || [];
  const gameActivity = activities.find(act => act.type === 0); // Playing

  const hasWarzone = gameActivity && WARZONE_KEYWORDS.some(keyword =>
    gameActivity.name?.toLowerCase().includes(keyword)
  );

  const guild = member.guild;
  const roleWarzone = guild.roles.cache.find(r => r.name === ROLE_WARZONE);
  const roleGeneric = guild.roles.cache.find(r => r.name === ROLE_GENERIC);

  // מסיר תפקידים אם הפסיק לשחק
  if (!gameActivity) {
    if (roleWarzone && member.roles.cache.has(roleWarzone.id)) {
      await member.roles.remove(roleWarzone).catch(() => {});
    }
    if (roleGeneric && member.roles.cache.has(roleGeneric.id)) {
      await member.roles.remove(roleGeneric).catch(() => {});
    }
    return;
  }

  // נותן תפקידים לפי סוג המשחק
  if (hasWarzone) {
    if (roleWarzone && !member.roles.cache.has(roleWarzone.id)) {
      await member.roles.add(roleWarzone).catch(() => {});
    }
    if (roleGeneric && member.roles.cache.has(roleGeneric.id)) {
      await member.roles.remove(roleGeneric).catch(() => {});
    }
  } else {
    if (roleGeneric && !member.roles.cache.has(roleGeneric.id)) {
      await member.roles.add(roleGeneric).catch(() => {});
    }
    if (roleWarzone && member.roles.cache.has(roleWarzone.id)) {
      await member.roles.remove(roleWarzone).catch(() => {});
    }
  }
}

// בודק מחדש את כל המשתמשים כשהבוט עולה
async function validatePresenceOnReady(client) {
  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch(); // לוודא שכל החברים נטענו

    const roleWarzone = guild.roles.cache.find(r => r.name === ROLE_WARZONE);
    const roleGeneric = guild.roles.cache.find(r => r.name === ROLE_GENERIC);

    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;

      const activities = member.presence?.activities || [];
      const gameActivity = activities.find(act => act.type === 0);
      const hasWarzone = gameActivity && WARZONE_KEYWORDS.some(keyword =>
        gameActivity.name?.toLowerCase().includes(keyword)
      );

      if (!gameActivity) {
        if (roleWarzone && member.roles.cache.has(roleWarzone.id)) {
          await member.roles.remove(roleWarzone).catch(() => {});
        }
        if (roleGeneric && member.roles.cache.has(roleGeneric.id)) {
          await member.roles.remove(roleGeneric).catch(() => {});
        }
      } else if (hasWarzone) {
        if (roleWarzone && !member.roles.cache.has(roleWarzone.id)) {
          await member.roles.add(roleWarzone).catch(() => {});
        }
        if (roleGeneric && member.roles.cache.has(roleGeneric.id)) {
          await member.roles.remove(roleGeneric).catch(() => {});
        }
      } else {
        if (roleGeneric && !member.roles.cache.has(roleGeneric.id)) {
          await member.roles.add(roleGeneric).catch(() => {});
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
