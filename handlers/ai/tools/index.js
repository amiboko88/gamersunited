// 📁 handlers/ai/tools/index.js
const dj = require('./dj');
const ranking = require('./ranking');
const identity = require('./identity');
const games = require('./games');
const birthday = require('./birthday');

const allTools = [dj, ranking, identity, games, birthday];

exports.definitions = allTools.map(t => t.definition);

// ✅ הוספנו chatId לחתימה של הפונקציה
exports.execute = async (name, args, userId, chatId) => {
    const tool = allTools.find(t => t.definition.function.name === name);
    if (tool) {
        try {
            // מעבירים את ה-chatId לכלי
            return await tool.execute(args, userId, chatId);
        } catch (e) {
            return `Error executing ${name}: ${e.message}`;
        }
    }
    return "Tool not found.";
};