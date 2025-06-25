const db = require("./utils/firebase");

function calculateXP(text) {
  if (!text) return 0;
  return Math.min(text.length, 25); // תקרה ל־25 תווים
}

async function updateXP(user) {
  const userId = user.id.toString();
  const ref = db.collection("levels").doc(userId);
  const snap = await ref.get();

  let data = snap.exists ? snap.data() : {
    level: 1,
    xp: 0,
    fullName: user.first_name || user.username || "חבר",
    createdAt: Date.now()
  };

  const addedXp = calculateXP(user.text || "");
  data.xp += addedXp;

  let leveledUp = false;
  const xpNeeded = data.level * 100;

  if (data.xp >= xpNeeded) {
    data.level++;
    data.xp -= xpNeeded;
    leveledUp = data.level;
  }

  await ref.set(data, { merge: true });

  return { leveledUp, addedXp };
}

async function getUserLevel(userId) {
  const ref = db.collection("levels").doc(userId.toString());
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
}

function handleTop(bot) {
  bot.command("profile_xp", async (ctx) => {
    const userId = ctx.from.id.toString();
    const data = await getUserLevel(userId);

    if (!data) {
      return ctx.reply("😢 לא נמצא מידע XP עבורך. תתחיל לתקשר יותר עם שמעון!");
    }

    const progress = Math.floor((data.xp / (data.level * 100)) * 100);
    const bar = `[${"█".repeat(progress / 10)}${"░".repeat(10 - progress / 10)}]`;

    await ctx.reply(
      `🎖️ <b>${data.fullName}</b>\n` +
      `🔢 רמה: <b>${data.level}</b>\n` +
      `📊 XP: ${data.xp}/${data.level * 100} ${bar}`,
      { parse_mode: "HTML" }
    );
  });
}

function registerTopButton(bot) {
  bot.callbackQuery("top_xp", async (ctx) => {
    const snapshot = await db.collection("levels")
      .orderBy("level", "desc")
      .limit(10)
      .get();

    if (snapshot.empty) {
      return ctx.answerCallbackQuery({ text: "אין נתונים כרגע", show_alert: true });
    }

    let msg = "🏆 <b>טבלת המצטיינים:</b>\n\n";
    let rank = 1;

    for (const doc of snapshot.docs) {
      const d = doc.data();
      const xpBar = "█".repeat(Math.floor((d.xp / (d.level * 100)) * 10)).padEnd(10, "░");
      msg += `${rank}. <b>${d.fullName}</b> – רמה ${d.level} (${d.xp}/${d.level * 100})\n[${xpBar}]\n\n`;
      rank++;
    }

    await ctx.editMessageText(msg, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
  });
}

async function getUserLevelCanvas(bot, userId) {
  const data = await getUserLevel(userId);
  if (!data) return null;

  // אם אין תמונה – שלח טקסט בלבד
  const text = `🎖️ <b>${data.fullName}</b>\n` +
               `🔢 רמה: <b>${data.level}</b>\n` +
               `📊 XP: ${data.xp}/${data.level * 100}`;

  // תוכל להוסיף כאן תמונה אם יש לך future `Canvas` או `URL`
  return { text, photo: null };
}
module.exports = {
  updateXP,
  registerTopButton,
  getUserLevelCanvas,
  handleTop
};
