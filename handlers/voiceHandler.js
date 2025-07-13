// 📁 handlers/voiceHandler.js
const fs = require('fs');
const path = require('path');
const { updateVoiceActivity } = require('./mvpTracker');
const {
  trackVoiceMinutes,
  trackJoinCount,
  trackJoinDuration,
  trackActiveHour
} = require('./statTracker');
const db = require('../utils/firebase');
const podcastManager = require('./podcastManager'); // ייבוא מודול ניהול הפודקאסט

// הגדרות כלליות עבור הבוט ותפקידים
const CHANNEL_ID = process.env.TTS_TEST_CHANNEL_ID; // משמש לזיהוי ערוץ ספציפי
const FIFO_ROLE_NAME = 'FIFO'; // שם התפקיד לניהול FIFO
const EXTRA_CATEGORY_ID = '1138785781322887233'; // קטגוריה נוספת לניטור ערוצים

// מפות לניהול זמני כניסה ופעילות קולית
const joinTimestamps = new Map();
const recentJoiners = new Map();

// הגדרות ספציפיות לתזמון פודקאסט - אלו משתנים שאינם בשימוש ישיר כאן ורלוונטיים ל-podcastManager
// triggerLevels = [2, 4, 6, 8, 10]; // רמות טריגר לפודקאסט
// triggerCooldownMs = 60 * 60 * 1000; // שעה
// minPresenceMs = 5000; // נוכחות מינימלית בערוץ
// recentJoinCooldownMs = 30000; // קירור לאחר הצטרפות
// minSilenceMs = 10000; // שקט מינימלי לפני פודקאסט
// lastTriggeredByChannel = new Map(); //
// lastVoiceActivityByChannel = new Map(); //

// טעינת קובץ צליל "פינג" אם קיים
let pingBuffer = null;
try {
  const pingPath = path.join(__dirname, '../assets/xbox.mp3');
  if (fs.existsSync(pingPath)) {
    pingBuffer = fs.readFileSync(pingPath);
  }
} catch {}

/**
 * בודק האם Channel ID נתון מנוטר.
 * פונקציה זו יכולה להיות שימושית עבור לוגיקה נוספת שאינה קשורה לפודקאסט הראשי.
 * @param {string} channelId - ה-ID של הערוץ.
 * @param {import('discord.js').Guild} guild - אובייקט השרת.
 * @returns {boolean} האם הערוץ מנוטר.
 */
function channelIdIsMonitored(channelId, guild) {
  const chan = guild.channels.cache.get(channelId);
  return (
    channelId === CHANNEL_ID ||
    (chan?.parentId && chan.parentId === EXTRA_CATEGORY_ID)
  );
}

/**
 * בודק האם שני מערכים שווים (לצורך השוואת משתמשים בערוץ).
 * פונקציה זו שימושית ללוגיקת קירור פנימית (אם נדרשת).
 * @param {Array<string>} a - מערך ראשון.
 * @param {Array<string>} b - מערך שני.
 * @returns {boolean} האם המערכים שווים.
 */
function arraysAreEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const aSorted = [...a].sort();
  const bSorted = [...b].sort();
  return aSorted.every((val, i) => val === bSorted[i]);
}

/**
 * מטפל בעדכוני מצב קולי של משתמשים.
 * זוהי נקודת הכניסה העיקרית לאירועי קול בבוט.
 * @param {import('discord.js').VoiceState} oldState - מצב הקול הישן של המשתמש.
 * @param {import('discord.js').VoiceState} newState - מצב הקול החדש של המשתמש.
 */
async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member;
  // התעלם מבוטים
  if (!member || member.user.bot) return;

  const userId = member.id;
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  const guild = member.guild;
  const now = Date.now();
  const client = member.client; // גישה לאובייקט ה-client של הבוט

  // התעלם מערוץ AFK
  if (newChannelId === guild.afkChannelId || oldChannelId === guild.afkChannelId) return;

  // 🎖️ ניהול תפקיד FIFO (בדיקה וכיוונון תפקידים על בסיס כניסה/יציאה מערוץ מסוים)
  const fifoRole = guild.roles.cache.find(r => r.name === FIFO_ROLE_NAME);
  if (fifoRole) {
    try {
      if (newChannelId === CHANNEL_ID && !member.roles.cache.has(fifoRole.id)) {
        await member.roles.add(fifoRole);
      }
      if (oldChannelId === CHANNEL_ID && newChannelId !== CHANNEL_ID && member.roles.cache.has(fifoRole.id)) {
        await member.roles.remove(fifoRole);
      }
    } catch (err) {
      console.error('⚠️ FIFO role error:', err.message);
    }
  }

  // ⏱️ מעקב אחר הצטרפות ויציאה מערוץ קולי עבור סטטיסטיקות
  const joined = !oldChannelId && newChannelId;
  const left = oldChannelId && !newChannelId;

  if (joined) {
    joinTimestamps.set(userId, now);
    recentJoiners.set(userId, now); // לשימוש במידת הצורך ב-statTracker/podcastManager
    await db.collection('voiceEntries').doc(userId).set({ joinedAt: now });
  }

  if (left) {
    const joinedAt = joinTimestamps.get(userId) || now - 60000; // 60 שניות ברירת מחדל אם אין חותמת זמן
    const durationMs = now - joinedAt;
    const durationMinutes = Math.max(1, Math.round(durationMs / 1000 / 60));

    if (durationMinutes > 0 && durationMinutes < 600) { // הגבלת משך זמן הגיוני
      await updateVoiceActivity(userId, durationMinutes, db);
      await trackVoiceMinutes(userId, durationMinutes);
      await trackJoinCount(userId);
      await trackJoinDuration(userId, durationMinutes);
      await trackActiveHour(userId);
      await db.collection('voiceTime').add({ userId, minutes: durationMinutes, date: new Date() });
      await db.collection('memberTracking').doc(userId).set({
        lastActivity: new Date().toISOString(),
        activityWeight: 2
      }, { merge: true });
    }

    joinTimestamps.delete(userId);
    await db.collection('voiceEntries').doc(userId).delete().catch(() => {});
  }

  // 🎧 הפעלת לוגיקת הפודקאסט המרכזית (מועברת למודול ייעודי)
  // קריאה לפונקציית הטריגר במודול podcastManager.js
  await podcastManager.handlePodcastTrigger(newState, client);

  // הערה: כל לוגיקת "ניטור שמעון" שהייתה כאן בעבר עבור הפודקאסט
  // הועברה במלואה ל-`handlers/podcastManager.js`.
  // `voiceHandler.js` אחראי כעת בעיקר על:
  // 1. מעקב אחר הצטרפות/עזיבה לסטטיסטיקות.
  // 2. ניהול תפקידי FIFO.
  // 3. העברת אירועי `voiceStateUpdate` למנהל הפודקאסט.
  // אם ישנן השמעות קוליות נוספות שאינן חלק מהפודקאסט וצריכות להישאר
  // ב-`voiceHandler.js`, יש להוסיף אותן כאן,
  // ולוודא שהן לא פועלות בזמן שהבוט בפודקאסט פעיל (ניתן לבדוק עם `podcastManager.isBotPodcasting`).
}

module.exports = {
  handleVoiceStateUpdate
};