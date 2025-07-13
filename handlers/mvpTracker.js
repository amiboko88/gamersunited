// 📁 handlers/mvpTracker.js (מעודכן ומתוקן לשגיאת force)
const admin = require('firebase-admin');
const { renderMvpImage } = require('./mvpRenderer');
const { log } = require('../utils/logger');
// ✅ ייבוא ישיר של DB
const db = require('../utils/firebase'); // וודא שהנתיב נכון

const Timestamp = admin.firestore.Timestamp;
const MVP_ROLE_ID = process.env.ROLE_MVP_ID;
const MVP_CHANNEL_ID = '583575179880431616'; // ודא ש-ID זה נכון

let lastPrintedDate = null;

/**
 * מחשב ומכריז על ה-MVP השבועי.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 * @param {object} db - אובייקט ה-Firebase Firestore.
 * @param {boolean} [force=false] - האם לכפות הכרזה גם אם כבר הוכרז היום.
 */
async function calculateAndAnnounceMVP(client, db, force = false) { // ✅ force עם ערך ברירת מחדל
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // זמן ישראל
  const today = now.toISOString().split('T')[0];
  const statusRef = db.doc('mvpSystem/status');
  const statusSnap = await statusRef.get();
  const statusData = statusSnap.exists ? statusSnap.data() : null;

  // תיקון: force תמיד יוגדר עכשיו, כך שלא יהיה undefined
  if (!force && statusData?.lastAnnouncedDate === today) {
    log(`⛔ MVP כבר הוכרז היום (${today}) – מתעלם`);
    return;
  }

  const statsRef = db.collection('weeklyStats');
  const statsSnap = await statsRef.get();
  if (statsSnap.empty) {
    log('⚠️ אין weeklyStats – לא ניתן לחשב MVP');
    return;
  }

  let topUser = null, maxScore = 0;

  for (const doc of statsSnap.docs) {
    const data = doc.data();
    const score = data.xpThisWeek || 0;

    if (score > maxScore) {
      maxScore = score;
      topUser = {
        id: doc.id,
        score,
        voice: data.voiceMinutes || 0,
        xp: score
      };
    }
  }

  if (!topUser) return log(`⚠️ לא נמצא מועמד ראוי ל־MVP`);

  const guild = client.guilds.cache.first(); // קח את השרת הראשון שהבוט נמצא בו
  if (!guild) {
      log('❌ לא נמצא שרת שהבוט נמצא בו.');
      return;
  }

  const member = await guild.members.fetch(topUser.id).catch((err) => {
    log(`⚠️ לא ניתן לאחזר חבר MVP (${topUser.id}): ${err.message}`);
    return null;
  });
  if (!member) return;

  const mvpRole = guild.roles.cache.get(MVP_ROLE_ID);
  if (!mvpRole) return log(`❌ תפקיד MVP לא נמצא (ID: ${MVP_ROLE_ID})`);

  try {
    // הסרת תפקיד MVP מכל מי שיש לו
    const allMembers = await guild.members.fetch();
    allMembers.forEach(m => {
      if (m.roles.cache.has(mvpRole.id)) {
        m.roles.remove(mvpRole).catch(err => log(`⚠️ שגיאה בהסרת תפקיד MVP מ־${m.user.tag}: ${err.message}`));
      }
    });
  } catch (err) {
    log(`⚠️ שגיאה בטעינת משתמשים (להסרת תפקיד MVP): ${err.message}`);
  }

  // הענקת תפקיד MVP למשתמש הנבחר
  await member.roles.add(mvpRole).catch(err => log(`❌ שגיאה בהענקת תפקיד MVP ל־${member.user.tag}: ${err.message}`));


  const mvpStatsRef = db.doc(`mvpStats/${topUser.id}`);
  const mvpStatsSnap = await mvpStatsRef.get();
  const wins = mvpStatsSnap.exists ? (mvpStatsSnap.data().wins || 0) + 1 : 1;
  await mvpStatsRef.set({ wins }, { merge: true }); // שימוש ב-merge כדי לא לדרוס נתונים קיימים

  const imagePath = await renderMvpImage({
    username: member.displayName || member.user.username,
    avatarURL: member.displayAvatarURL({ extension: 'png', size: 512 }),
    minutes: topUser.voice,
    wins,
    fresh: true
  }).catch(err => {
      log(`❌ שגיאה ביצירת תמונת MVP: ${err.message}`);
      return null;
  });

  if (!imagePath) return; // אם יצירת התמונה נכשלה

  const channel = client.channels.cache.get(MVP_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return log(`❌ ערוץ MVP לא נמצא או אינו ערוץ טקסט (ID: ${MVP_CHANNEL_ID})`);

  // מחיקת הודעת ה-MVP הישנה
  if (statusData?.messageId && statusData?.channelId) {
    const oldChannel = client.channels.cache.get(statusData.channelId);
    const oldMessage = await oldChannel?.messages?.fetch(statusData.messageId).catch(() => null);
    if (oldMessage) {
      await oldMessage.delete().catch(err => log(`⚠️ שגיאה במחיקת הודעת MVP ישנה: ${err.message}`));
    }
  }

  const message = await channel.send({ content: '@everyone', files: [imagePath] }).catch(err => {
      log(`❌ שגיאה בשליחת הודעת MVP לערוץ: ${err.message}`);
      return null;
  });
  if (!message) return;

  await message.react('🏅').catch(err => log(`⚠️ שגיאה בהוספת ריאקציה להודעת MVP: ${err.message}`));

  await statusRef.set({
    lastCalculated: Timestamp.now(),
    lastAnnouncedDate: today,
    messageId: message.id,
    channelId: message.channel.id,
    reacted: false // יתכן שזה נתון אחר שצריך להיות כאן
  }, { merge: true }); // שימוש ב-merge כדי לא לדרוס נתונים קיימים

  // מחיקת נתוני weeklyStats לאחר הכרזת MVP
  for (const doc of statsSnap.docs) {
    await db.doc(`weeklyStats/${doc.id}`).delete().catch(err => log(`⚠️ שגיאה במחיקת weeklyStats עבור ${doc.id}: ${err.message}`));
  }

  log(`🏆 MVP: ${member.user.username} (${topUser.voice} דקות, ${topUser.xp} XP, ${wins} זכיות)`);
}

/**
 * בודק את סטטוס ה-MVP ומפעיל את החישוב וההכרזה אם זה יום ראשון ולא הוכרז עדיין.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 * @param {object} db - אובייקט ה-Firebase Firestore.
 */
async function checkMVPStatusAndRun(client, db) {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // Israel time
  const today = now.toISOString().split('T')[0];
  const day = now.getDay(); // 0 = Sunday

  if (day !== 0) return; // Run only on Sundays (0 = Sunday)

  const statusSnap = await db.doc('mvpSystem/status').get();
  const lastDate = statusSnap.exists ? statusSnap.data()?.lastAnnouncedDate : null;

  if (lastDate === today) {
      if (lastPrintedDate !== today) {
        lastPrintedDate = today;
        log(`⏱️ MVP כבר פורסם היום`);
      }
      return;
  }

  log(`📢 יום ראשון – מחשב MVP...`);
  lastPrintedDate = today;

  // תיקון: העברת false כארגומנט ל-force
  await calculateAndAnnounceMVP(client, db, false); // ✅ העברת false כערך ל-force
}

/**
 * מעדכן את דקות הפעילות הקולית של משתמש ב-Firebase.
 * @param {string} userId - ה-ID של המשתמש.
 * @param {number} minutes - כמות הדקות להוספה.
 * @param {object} db - אובייקט ה-Firebase Firestore.
 */
async function updateVoiceActivity(userId, minutes, db) {
  const ref = db.collection('voiceLifetime').doc(userId);
  const doc = await ref.get();
  const current = doc.exists ? doc.data().total || 0 : 0;
  await ref.set({
    total: current + minutes,
    lastUpdated: Date.now()
  }, { merge: true });
}

module.exports = {
  calculateAndAnnounceMVP,
  checkMVPStatusAndRun,
  updateVoiceActivity,
};