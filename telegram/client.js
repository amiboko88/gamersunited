const { Bot } = require("grammy");
const { log } = require('../utils/logger');

let bot = null;

// ✅ New: Setter for the main instance
function setBot(instance) {
    if (bot) {
        log('⚠️ [Telegram Client] Overwriting existing bot instance.');
    }
    bot = instance;
}

// ✅ Modified: Getter now only returns the active instance
// It does NOT create a new one automatically to avoid split-brain
function getBot() {
    return bot;
}

function isRunning() {
    return !!bot;
}

module.exports = { getBot, setBot, isRunning };
