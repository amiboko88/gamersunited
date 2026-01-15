const { Bot } = require("grammy");
const { log } = require('../utils/logger');

let bot = null;

function getBot() {
    if (!bot && process.env.TELEGRAM_TOKEN) {
        bot = new Bot(process.env.TELEGRAM_TOKEN);
    }
    return bot;
}

function isRunning() {
    return !!bot;
}

module.exports = { getBot, isRunning };
