// 📁 handlers/ai/tools/index.js
const dj = require('./dj');
const ranking = require('./ranking');
const identity = require('./identity');

const allTools = [dj, ranking, identity];

exports.definitions = allTools.map(t => t.definition);

exports.execute = async (name, args, userId) => {
    const tool = allTools.find(t => t.definition.function.name === name);
    if (tool) {
        try {
            return await tool.execute(args, userId);
        } catch (e) {
            return `Error running tool ${name}: ${e.message}`;
        }
    }
    return "Tool not found.";
};