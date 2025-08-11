// 📁 utils/replayManager.js
const { log } = require('./logger');

const teams = new Map();
const votes = new Map(); // מפה לאחסון הצבעות האיפוס

/**
 * רושם קבוצה חדשה במערכת.
 */
function registerTeam(teamName, members) {
    teams.set(teamName, { members, size: members.length });
    votes.set(teamName, new Set()); // אתחול מאגר הצבעות ריק
    log(`[VOTE] קבוצה ${teamName} נרשמה להצבעת איפוס.`);
}

/**
 * ✅ [שדרוג] מוסיף הצבעה לאיפוס עבור משתמש בקבוצה.
 * @param {string} userId
 * @param {string} teamName
 * @returns {boolean} - מחזיר true אם ההצבעה חדשה, false אם המשתמש כבר הצביע
 */
function addResetVote(userId, teamName) {
    if (!votes.has(teamName)) return false;

    const teamVotes = votes.get(teamName);
    if (teamVotes.has(userId)) {
        return false; // כבר הצביע
    }
    
    teamVotes.add(userId);
    return true;
}

/**
 * ✅ [שדרוג] בודק אם קבוצה הגיעה למספר ההצבעות הדרוש לאיפוס.
 * @param {string} teamName
 * @returns {boolean}
 */
function hasEnoughVotesToReset(teamName) {
    const team = teams.get(teamName);
    const teamVotes = votes.get(teamName);

    if (!team || !teamVotes) return false;

    return teamVotes.size >= team.size;
}

/**
 * מאפס את כל נתוני ההצבעות והקבוצות.
 */
function resetReplayVotes() {
    teams.clear();
    votes.clear();
    log('[VOTE] כל נתוני ההצבעות אופסו.');
}

module.exports = {
    registerTeam,
    addResetVote,
    hasEnoughVotesToReset,
    resetReplayVotes,
    teams // ייצוא המפה כדי שנוכל למצוא את הקבוצה היריבה
};