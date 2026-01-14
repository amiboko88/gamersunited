// 📁 handlers/ai/tools/index.js
const dj = require('./dj');
const ranking = require('./ranking');
const identity = require('./identity');
const birthday = require('./birthday');
const match = require('./match'); // ✅ הכלי החדש שמחליף את המשחקים
const stats = require('./stats'); // ✅ COD Stats

// הסרנו את games (הישן) מהרשימה
const allTools = [dj, ranking, identity, birthday, match, stats];

exports.definitions = allTools.map(t => t.definition);

exports.execute = async (name, args, userId, chatId) => {
    const tool = allTools.find(t => t.definition.function.name === name);
    if (tool) {
        try {
            return await tool.execute(args, userId, chatId);
        } catch (e) {
            return `Error: ${e.message}`;
        }
    }
    return "Tool not found.";
};