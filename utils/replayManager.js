// 📁 utils/replayManager.js – ניהול חכם של הצבעות Replay עם מעקב שחקנים
const activeGroups = new Map();
const replayVotes = new Map();
/*
  מבנה:
  {
    'TEAM A': {
      members: ['user1', 'user2', 'user3'],
      voted: Set('user2', 'user3')
    }
  }
*/

/**
 * רישום שחקני קבוצה בעת יצירתה
 * @param {string} teamName
 * @param {string[]} userIds
 */
function registerTeam(teamName, userIds) {
  replayVotes.set(teamName, {
    members: userIds,
    voted: new Set()
  });
}

/**
 * רישום הצבעת Replay של שחקן בקבוצה
 * @param {string} teamName
 * @param {string} userId
 * @returns {object} מידע על מצב ההצבעות
 */
function registerReplayVote(teamName, userId) {
  const team = replayVotes.get(teamName);
  if (!team) return null;

  team.voted.add(userId);

  const total = team.members.length;
  const voted = team.voted.size;
  const allVoted = voted >= total;
  const someVoted = voted > 0;

  return {
    teamName,
    total,
    voted,
    allVoted,
    someVoted,
    remaining: total - voted,
    missing: team.members.filter(id => !team.voted.has(id))
  };
}

/**
 * מחזיר true אם יש הצבעות בקבוצה
 * @param {string} teamName
 * @returns {boolean}
 */
function hasReplayVotes(teamName) {
  const team = replayVotes.get(teamName);
  return team && team.voted.size > 0;
}

/**
 * החזרת כל הקבוצות עם מידע מלא
 */
function getAllReplayStates() {
  const result = [];
  for (const [teamName, data] of replayVotes.entries()) {
    result.push({
      teamName,
      members: data.members,
      voted: [...data.voted],
      total: data.members.length
    });
  }
  return result;
}

/**
 * איפוס כל ההצבעות והקבוצות
 */
function resetReplayVotes() {
  replayVotes.clear();
}

module.exports = {
  
  registerTeam,
  registerReplayVote,
  hasReplayVotes,
  getAllReplayStates,
  resetReplayVotes,
  activeGroups
};
