// 📁 telegram/telegramLevelSystem.js (מעודכן: תיקון שימוש ב-XP_PER_MESSAGE)
const db = require("../utils/firebase");
const generateXPLeaderboardImage = require("./generateXPLeaderboardImage");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const openai = require('../utils/openaiConfig');
const { InputFile } = require("grammy");

const XP_PER_MESSAGE = 15; // ✅ משתנה זה ישמש כעת כ-XP קבוע פר הודעה
const LEVEL_UP_MULTIPLIER = 100;
const XP_COOLDOWN = 60 * 1000;

const lastXpMessage = new Map();
const topCooldown = new Map();


/**
 * ✅ פונקציה: calculateXP - תחזיר XP קבוע פר הודעה
 * @param {string} text - הטקסט של ההודעה.
 * @returns {number} - כמות ה-XP שתיצבר.
 */
function calculateXP(text) {
    if (text && text.length > 0) { // אם יש טקסט כלשהו
        return XP_PER_MESSAGE; // ✅ החזר את הערך הקבוע של XP_PER_MESSAGE
    }
    return 0; // אין טקסט, אין XP
}


/**
 * מחשב את הרמה הנוכחית של המשתמש.
 * @param {number} xp - נקודות ה-XP של המשתמש.
 * @returns {number} - הרמה הנוכחית.
 */
function calculateLevel(xp) {
    let level = 0;
    let nextLevelXpThreshold = LEVEL_UP_MULTIPLIER;

    while (xp >= nextLevelXpThreshold) {
        level++;
        nextLevelXpThreshold += (level + 1) * LEVEL_UP_MULTIPLIER;
    }
    return level;
}

/**
 * מחשב את ה-XP הנדרש לרמה הבאה.
 * @param {number} level - הרמה הנוכחית.
 * @returns {number} - XP הנדרש לרמה הבאה.
 */
function getXpForNextLevel(level) {
    return (level + 1) * LEVEL_UP_MULTIPLIER;
}

/**
 * מעדכן את ה-XP של המשתמש.
 * @param {object} messageData - אובייקט עם id, first_name, username, text.
 * @param {import('grammy').Context} ctx - אובייקט הקונטקסט של grammy (אופציונלי, נחוץ לשליחת DM).
 */
async function updateXp(messageData, ctx = null) {
    const userId = messageData.id.toString();
    const name = messageData.first_name || "חבר";

    const now = Date.now();
    if (lastXpMessage.has(userId) && (now - lastXpMessage.get(userId) < XP_COOLDOWN)) {
        return { addedXp: 0 };
    }

    lastXpMessage.set(userId, now);

    const userRef = db.collection("levels").doc(userId);
    const doc = await userRef.get();

    let currentXp = 0;
    let currentLevel = 0;

    if (doc.exists) {
        const data = doc.data();
        currentXp = data.xp || 0;
        currentLevel = data.level || 0;
    } else {
        await userRef.set({ xp: 0, level: 0, fullName: name, username: messageData.username || null, createdAt: Date.now() });
    }

    const gain = calculateXP((messageData.text || "").trim());
    if (gain === 0) return { addedXp: 0 };

    const newXp = currentXp + gain;
    const newLevel = calculateLevel(newXp);

    await userRef.set({
        xp: newXp,
        level: newLevel,
        username: messageData.username,
        fullName: name
    }, { merge: true });

    if (newLevel > currentLevel) {
        const xpNeededForNext = getXpForNextLevel(newLevel);
        let xpAtCurrentLevelStart = 0;
        for (let l = 0; l < newLevel; l++) {
            xpAtCurrentLevelStart += l * LEVEL_UP_MULTIPLIER;
        }
        const xpProgressInCurrentLevel = newXp - xpAtCurrentLevelStart;
        const progressPercent = Math.floor((xpProgressInCurrentLevel / xpNeededForNext) * 100);


        const levelUpMessage = `🎉 מזל טוב, ${name}! עלית רמה! 🎉\n` +
                               `**רמה חדשה:** ${newLevel}\n` +
                               `**XP נוכחי:** ${newXp}\n` +
                               `**התקדמות לרמה הבאה:** ${xpProgressInCurrentLevel}/${xpNeededForNext} XP (${progressPercent}%)\n\n` +
                               `המשך לצבור XP כדי להגיע לרמות גבוהות יותר!`;
        
        if (ctx) {
            try {
                await ctx.api.sendMessage(userId, levelUpMessage);
            } catch (dmError) {
                console.warn(`⚠️ לא ניתן לשלוח הודעת עליית רמה ב-DM למשתמש ${userId}:`, dmError.message);
            }
        }
    }
    return { addedXp: gain, leveledUp: newLevel > currentLevel ? newLevel : null };
}

// 🏆 פקודת טקסט רגילה של טבלת XP
function handleTop(bot) {
  bot.command("topxp", async (ctx) => {
    const usersSnap = await db.collection("levels")
      .orderBy("level", "desc")
      .orderBy("xp", "desc")
      .limit(10)
      .get();

    if (usersSnap.empty) return ctx.reply("אין נתוני XP עדיין.");

    const list = usersSnap.docs.map((doc, i) => {
      const d = doc.data();
      return `${i + 1}. <b>${d.fullName || d.username || "אנונימי"}</b> – רמה ${d.level} (${d.xp} XP)`;
    }).join("\n");

    await ctx.reply(`🏆 <b>טבלת מצטייני XP</b>\n\n${list}`, { parse_mode: "HTML" });
  });
}

// 📈 טבלת XP גרפית דרך כפתור Telegram + אנטי ספאם
function registerTopButton(bot) {
  bot.callbackQuery("profile_top", async (ctx) => {
    const userId = ctx.from.id;
    const now = Date.now();
    const lastUsed = topCooldown.get(userId) || 0;

    if (now - lastUsed < 15000) { // 15 שניות cooldown
      return ctx.answerCallbackQuery({
        text: "⏳ חכה רגע לפני שתנסה שוב (הגנת ספאם).",
        show_alert: true,
      });
    }

    topCooldown.set(userId, now);

    try {
      const usersSnap = await db.collection("levels")
        .orderBy("level", "desc")
        .orderBy("xp", "desc")
        .limit(10)
        .get();

      if (usersSnap.empty) {
        await ctx.reply("אין נתונים להציג כרגע.");
        return ctx.answerCallbackQuery();
      }

      const users = usersSnap.docs.map(doc => {
          const data = doc.data();
          return {
              username: data.fullName || data.username || 'משתמש לא ידוע',
              level: data.level,
              xp: data.xp,
              totalVoiceTime: 0, // ⚠️ אין נתוני זמן קול בקולקציית levels. אם רוצים, צריך לשלוף מ-userStats
              avatarURL: data.profilePictureUrl || null // אם שומרים ב-DB
          };
      });

      // ✅ ניתן לשלוף אוואטרים מ-Telegram API כאן אם הם לא נשמרים ב-DB
      for (let user of users) {
          if (!user.avatarURL && ctx) {
              const member = await ctx.api.getChatMember(ctx.chat.id, user.id).catch(() => null);
              if (member?.user?.photo?.big_file_id) {
                  user.avatarURL = await ctx.api.getFileLink(member.user.photo.big_file_id);
              }
          }
      }

      const imageBuffer = await generateXPLeaderboardImage(users);

      if (!imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length < 1000) {
        await ctx.reply("😕 לא הצלחתי ליצור תמונה תקינה של טבלת המצטיינים.");
        return ctx.answerCallbackQuery();
      }

      // ✉️ שליחה בטוחה ל־Telegram
      await ctx.replyWithPhoto(new InputFile(imageBuffer, 'leaderboard.png'), { caption: '🏆 טבלת מובילי XP בקהילה:', parse_mode: "HTML" });

      await ctx.answerCallbackQuery(); // תגובה ל-callback query
      
    } catch (err) {
      console.error("🚨 שגיאה בהצגת טבלת XP:", err);
      await ctx.reply("⚠️ שגיאה זמנית. נסה שוב מאוחר יותר.");
      await ctx.answerCallbackQuery();
    }
  });
}

module.exports = {
  updateXp,
  handleTop,
  registerTopButton,
};