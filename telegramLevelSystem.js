const db = require("./utils/firebase");
const { createLeaderboardImage } = require("./generateXPLeaderboardImage");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

const topCooldown = new Map(); // userId -> timestamp

// 🧪 בר טקסטואלי
async function sendXPTextBar(ctx, userName, currentXP, level, nextLevelXP) {
  const percent = Math.min((currentXP / nextLevelXP) * 100, 100);
  const barLength = 10;

  const filledCount = Math.round((percent / 100) * barLength);
  const emptyCount = barLength - filledCount;

  const progressBar = "🟦".repeat(filledCount) + "⬜".repeat(emptyCount);
  const xpLeft = Math.max(nextLevelXP - currentXP, 0);

  const message =
`✨ <b>${userName} התקדם ב־XP!</b>

🧬 <b>רמה:</b> ${level}
📊 <b>התקדמות:</b> ${progressBar} (${Math.floor(percent)}%)
🎯 <b>לרמה הבאה:</b> עוד ${xpLeft} XP`;

  await ctx.reply(message, { parse_mode: "HTML" });
}

// 🧠 עדכון XP
async function updateXP({ id, first_name, username, text }, ctx = null) {
  try {
    const userId = id.toString();
    const name = first_name || "חבר";

    const userRef = db.collection("levels").doc(userId);
    const doc = await userRef.get();

    let xp = 0;
    let level = 1;

    if (doc.exists) {
      xp = doc.data().xp || 0;
      level = doc.data().level || 1;
    } else {
      await userRef.set({
        xp: 0,
        level: 1,
        fullName: name,
        username: username || null,
        createdAt: Date.now()
      });
    }

    const gain = Math.floor((text || "").trim().length / 3);
    if (gain === 0) return { addedXp: 0 };

    xp += gain;
    const nextLevelXP = level * 25;

    let leveledUp = null;
    if (xp >= nextLevelXP) {
      level++;
      xp -= nextLevelXP;
      leveledUp = level;
    }

    await userRef.set({ xp, level, username, fullName: name }, { merge: true });

    if (ctx) {
      await sendXPTextBar(ctx, name, xp, level, level * 25);
    }

    return { addedXp: gain, leveledUp };
  } catch (err) {
    console.error("❌ שגיאה בעדכון XP:", err);
    return { addedXp: 0 };
  }
}
// 🏆 טופ ברמת טקסט
function handleTop(bot) {
  bot.command("topxp", async (ctx) => {
    const usersSnap = await db.collection("levels")
      .orderBy("level", "desc")
      .orderBy("xp", "desc")
      .limit(10)
      .get();

    if (usersSnap.empty) return ctx.reply("אין עדיין אף אחד עם XP.");

    const list = usersSnap.docs.map((doc, i) => {
      const d = doc.data();
      return `${i + 1}. <b>${d.fullName || d.username || "אנונימי"}</b> – רמה ${d.level} (${d.xp} XP)`;
    }).join("\n");

    await ctx.reply(`🏆 <b>טבלת מצטייני XP</b>\n\n${list}`, { parse_mode: "HTML" });
  });
}

// 📈 כפתור גרפי – שולח תמונה עם הגנה מספאם
function registerTopButton(bot) {
  bot.callbackQuery("profile_top", async (ctx) => {
    const userId = ctx.from.id;
    const now = Date.now();
    const last = topCooldown.get(userId) || 0;

    if (now - last < 15000) {
      return ctx.answerCallbackQuery({
        text: "⏳ חכה רגע... מגנון אנטי־ספאם מופעל.",
        show_alert: true
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
        await ctx.reply("אין עדיין XP.");
        return ctx.answerCallbackQuery();
      }

      const users = usersSnap.docs.map(doc => doc.data());
      const buffer = createLeaderboardImage(users);

      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 1000) {
        return ctx.reply("😕 לא הצלחתי ליצור תמונה תקינה של טבלת המצטיינים.");
      }

      const filePath = path.join("/tmp", `xp_leaderboard_${userId}.png`);
      fs.writeFileSync(filePath, buffer);

      const form = new FormData();
      form.append("chat_id", ctx.chat.id);
      form.append("caption", "📈 <b>טבלת מצטייני XP</b>");
      form.append("photo", fs.createReadStream(filePath));
      form.append("parse_mode", "HTML");

      const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendPhoto`;
      await axios.post(telegramUrl, form, { headers: form.getHeaders() });

      fs.unlink(filePath, () => {});
      await ctx.answerCallbackQuery();

    } catch (err) {
      console.error("❌ שגיאה בהצגת טבלת XP:", err);
      await ctx.reply("🚨 שגיאה פנימית. נסה שוב מאוחר יותר.");
      await ctx.answerCallbackQuery();
    }
  });
}

module.exports = {
  updateXP,
  handleTop,
  registerTopButton,
  sendXPTextBar
};
