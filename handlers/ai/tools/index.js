// 📁 handlers/ai/tools/index.js
const dj = require('./dj');
const ranking = require('./ranking');
const identity = require('./identity');
const birthday = require('./birthday');
const match = require('./match');
const codStats = require('./cod_stats'); // ✅ ניתוח תמונות וורזון

// הסרנו את games (הישן) מהרשימה
const allTools = [dj, ranking, identity, birthday, match, codStats];

exports.definitions = allTools.map(t => t.definition);

exports.execute = async (name, args, userId, chatId) => {
    const tool = allTools.find(t => t.definition.function.name === name);
    if (tool) {
        try {
            return await tool.execute(args, userId, chatId, imageBuffer); // ✅ העברת תמונה לכלי שצריך אותה
        } catch (e) {
            return `Error: ${e.message}`;
        }
    }
    return "Tool not found.";
};