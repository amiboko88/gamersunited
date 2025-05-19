// 📁 handlers/presenceTracker.js – גרסה יציבה ושקטה לניטור תפקידים לפי נוכחות
const { log } = require('../utils/logger');

const WARZONE_KEYWORDS = ['Black Ops 6', 'Call Of Duty'];
const ROLE_WARZONE_ID = process.env.ROLE_WARZONE_ID;
const ROLE_GENERIC_ID = process.env.ROLE_GENERIC_ID;

// זיהוי פעילות משחק
function isPlayingWarzone(presence) {
  const gameActivity = presence?.activities?.find(a => a.type === 0);
  if (!gameActivity) return false;
  return WARZONE_KEYWORDS.some(keyword =>
    gameActivity.name?.toLowerCase().includes(keyword.toLowerCase())
  );
}

// זיהוי משתמש כלא פעיל (אופליין / ללא נוכחות)
function isOffline(presence) {
  return !presence || presence.status === 'offline';
}

// טיפול בזמן אמת
async function trackGamePresence(presence) {
  if (!presence || !presence.member || presence.user?.bot) return;
  const member = presence.member;

  try {
    if (isOffline(presence)) {
      await removeRoles(member);
    } else if (isPlayingWarzone(presence)) {
      await applyRoles(member, true);
    } else {
      await applyRoles(member, false);
    }
  } catch (_) {}
}

// סריקה רכה שקטה לכל משתמשים מחוברים (לא פוגעת בלוג)
async function softPresenceScan(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;

      const presence = member.presence;

      try {
        if (isOffline(presence)) {
          await removeRoles(member);
        } else if (isPlayingWarzone(presence)) {
          await applyRoles(member, true);
        } else {
          await applyRoles(member, false);
        }
      } catch (_) {}
    }
  }
}

// מתן/הסרת תפקידים לפי מצב
async function applyRoles(member, isWarzone) {
  const hasWarzone = member.roles.cache.has(ROLE_WARZONE_ID);
  const hasGeneric = member.roles.cache.has(ROLE_GENERIC_ID);

  if (isWarzone) {
    if (!hasWarzone && ROLE_WARZONE_ID) {
      await member.roles.add(ROLE_WARZONE_ID).catch(() => {});
    }
    if (hasGeneric && ROLE_GENERIC_ID) {
      await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
    }
  } else {
    if (!hasGeneric && ROLE_GENERIC_ID) {
      await member.roles.add(ROLE_GENERIC_ID).catch(() => {});
    }
    if (hasWarzone && ROLE_WARZONE_ID) {
      await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
    }
  }
}

// הסרת כל התפקידים כשהמשתמש אופליין
async function removeRoles(member) {
  if (ROLE_WARZONE_ID && member.roles.cache.has(ROLE_WARZONE_ID)) {
    await member.roles.remove(ROLE_WARZONE_ID).catch(() => {});
  }
  if (ROLE_GENERIC_ID && member.roles.cache.has(ROLE_GENERIC_ID)) {
    await member.roles.remove(ROLE_GENERIC_ID).catch(() => {});
  }
}

module.exports = {
  trackGamePresence,
  softPresenceScan
};
