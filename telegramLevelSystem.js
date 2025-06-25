const db = require("./utils/firebase");

// בר גרפי של XP
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

// 🧠 פונקציה ראשית שנקראת מתוך shimonTelegram.js
async function updateXP({ id, first_name, username, text }, ctx = null) {
  try {
    const userId = id.toString();
    const name = first_name || "חבר";

    const userRef = db.collection("telegramUsers").doc(userId);
    const doc = await userRef.get();

    let xp = doc.exists ? doc.data().xp || 0 : 0;
    let level = doc.exists ? doc.data().level || 1 : 1;

    const gain = Math.floor(text.length / 8); // נוסחה דינמית לצבירת XP
    if (gain === 0) return { addedXp: 0 };

    xp += gain;
    const nextLevelXP = level * 25;

    let leveledUp = null;
    if (xp >= nextLevelXP) {
      level++;
      xp -= nextLevelXP;
      leveledUp = level;
    }

    await userRef.set({ xp, level, username }, { merge: true });

    if (ctx) {
      await sendXPTextBar(ctx, name, xp, level, level * 25);
    }

    return { addedXp: gain, leveledUp };
  } catch (err) {
    console.error("❌ שגיאה בעדכון XP:", err);
    return { addedXp: 0 };
  }
}

// טבלת מובילים (אופציונלי)
function handleTop(bot) {
  bot.command("topxp", async (ctx) => {
    const usersSnap = await db.collection("telegramUsers")
      .orderBy("level", "desc")
      .limit(10)
      .get();

    if (usersSnap.empty) return ctx.reply("אין עדיין אף אחד עם XP.");

    const list = usersSnap.docs.map((doc, i) => {
      const d = doc.data();
      return `${i + 1}. <b>${d.first_name || "אנונימי"}</b> – רמה ${d.level} (${d.xp} XP)`;
    }).join("\n");

    await ctx.reply(`🏆 <b>טבלת מצטייני XP</b>\n\n${list}`, { parse_mode: "HTML" });
  });
}

function registerTopButton(bot) {
  bot.callbackQuery("profile_top", async (ctx) => {
    const usersSnap = await db.collection("telegramUsers")
      .orderBy("level", "desc")
      .limit(10)
      .get();

    if (usersSnap.empty) return ctx.reply("אין עדיין XP.");

    const list = usersSnap.docs.map((doc, i) => {
      const d = doc.data();
      return `${i + 1}. <b>${d.first_name || "?"}</b> – רמה ${d.level} (${d.xp} XP)`;
    }).join("\n");

    await ctx.reply(`📈 <b>טבלת מצטיינים</b>\n\n${list}`, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
  });
}

module.exports = {
  updateXP,
  handleTop,
  registerTopButton
};
