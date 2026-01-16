// 📁 discord/events/voiceBridge.js
// const { sendToMainGroup } = require('../../whatsapp/index'); -- CIRCULAR FIX
const db = require('../../utils/firebase');
const graphics = require('../../handlers/graphics/index'); // ✅ ייבוא המערכת הגרפית
const { log } = require('../../utils/logger');

// 🛑 רשימה שחורה: ערוצים ששמעון מתעלם מהם (סודיים / AFK)
const IGNORED_CHANNELS = [
    '1396779274173943828', // <-- שים פה את ה-ID של החדר הסודי שלך!
    '800783674223624252'   // חדר AFK אם יש
];

// הגדרות FOMO
const MIN_USERS_TO_ALERT = 2; // מינימום אנשים כדי לדווח
const ALERT_COOLDOWN = 15 * 60 * 1000; // לא לדווח על אותו חדר יותר מפעם ב-15 דקות

const roomCooldowns = new Map();

/**
 * הלוגיקה הראשית
 */
const podcastManager = require('../../handlers/voice/podcast'); // ✅ חיבור לפודקאסט

// ...

async function handleVoiceStateUpdate(oldState, newState) {
    const channel = newState.channel;

    // 1. קריאה לפודקאסט (חשוב!)
    await podcastManager.handleVoiceStateUpdate(oldState, newState);

    // 2. אם זו לא כניסה לחדר (או שזה יציאה) - מתעלמים
    if (!channel || (oldState.channelId === newState.channelId)) return;

    // 3. סינון ערוצים סודיים
    if (IGNORED_CHANNELS.includes(channel.id)) return;

    // לוגיקת FOMO הועברה ל-Scheduler למניעת ספאם. 
    // כאן אנו רק מוודאים שהאירועים זורמים.
}

module.exports = { handleVoiceStateUpdate };