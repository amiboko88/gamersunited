// 📁 handlers/ai/tools/index.js
const dj = require('./dj');
const ranking = require('./ranking');
const identity = require('./identity');
const games = require('./games'); // ✅ חדש
const birthday = require('./birthday'); // ✅ חדש

const allTools = [dj, ranking, identity, games, birthday];

exports.definitions = allTools.map(t => t.definition);

exports.execute = async (name, args, userId) => {
    const tool = allTools.find(t => t.definition.function.name === name);
    if (tool) {
        try {
            return await tool.execute(args, userId);
        } catch (e) {
            return `Error executing ${name}: ${e.message}`;
        }
    }
    return "Tool not found.";
};