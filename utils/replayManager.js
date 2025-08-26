// 📁 utils/replayManager.js (משודרג ותקין)
const { log } = require('./logger');

const teams = new Map();
const votes = new Map();

function registerTeam(teamName, members) {
    const teamData = { members, size: members.length };
    teams.set(teamName, teamData);
    votes.set(teamName, new Set()); // מאתחל סט הצבעות ריק
    log(`[VOTE] קבוצה ${teamName} נרשמה למערכת ההצבעות.`);
    return teamData;
}

function addResetVote(userId, teamName) {
    if (!votes.has(teamName)) return false;
    const teamVotes = votes.get(teamName);
    if (teamVotes.has(userId)) return false; // כבר הצביע
    teamVotes.add(userId);
    return true;
}

function hasEnoughVotesToReset(teamName, teamSize) {
    const teamVotes = votes.get(teamName);
    return teamVotes && teamVotes.size >= teamSize;
}

function getVoteCount(teamName) {
    return votes.get(teamName)?.size || 0;
}

// ✅ [הוחזר] בודק אם שתי הקבוצות הצביעו ל-Replay
function hasBothTeamsVoted() {
    if (teams.size < 2) return false;
    // ודא שלכל קבוצה רשומה יש לפחות הצבעה אחת
    return Array.from(votes.values()).every(voteSet => voteSet.size > 0);
}

// ✅ [הוחזר] מחזיר את כל המידע על הקבוצות הפעילות
function getAllTeams() {
    return Array.from(teams.values());
}

function resetReplayVotes() {
    teams.clear();
    votes.clear();
    log('[VOTE] כל נתוני ההצבעות והקבוצות אופסו.');
}

module.exports = {
    registerTeam,
    addResetVote,
    hasEnoughVotesToReset,
    resetReplayVotes,
    getVoteCount,
    hasBothTeamsVoted,
    getAllTeams,
    teams
};