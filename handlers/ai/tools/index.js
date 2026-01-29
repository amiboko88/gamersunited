// 📁 handlers/ai/tools/index.js
const dj = require('./dj');
const ranking = require('./ranking');
const identity = require('./identity');
const birthday = require('./birthday');
const match = require('./match');
const codStats = require('./cod_stats'); // ✅ ניתוח תמונות וורזון
const linkAlias = require('./link_alias'); // ✅ קישור כינויים בדיעבד
const queryStats = require('./query_stats'); // ✅ שאילתת נתונים (AI)
const showLeaderboard = require('./show_leaderboard'); // 🏆 ויזואליזציה של טבלה
const showProfile = require('./show_cod_profile'); // 🪖 כרטיס שחקן אישי וורזון

// הסרנו את games (הישן) מהרשימה
const wzhubMeta = require('./wzhub_meta'); // ✅ WZ Meta Guns
const allTools = [dj, ranking, identity, birthday, match, codStats, linkAlias, queryStats, showLeaderboard, showProfile, wzhubMeta];

exports.definitions = allTools.map(t => t.definition);

exports.execute = async (name, args, userId, chatId, imageBuffers) => {
    const tool = allTools.find(t => t.definition.function.name === name);
    if (tool) {
        try {
            return await tool.execute(args, userId, chatId, imageBuffers); // ✅ העברת תמונות לכלי
        } catch (e) {
            return `Error: ${e.message}`;
        }
    }
    return "Tool not found.";
};