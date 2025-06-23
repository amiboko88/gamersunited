// 📁 telegramLevelSystem.js — XP, רמות, תיוג, פרופילים וטבלה

const db = require("./utils/firebase");

// 📣 תיוג לפי שם משתמש (username בלבד)
const NAME_TAGS = {
  "עומרי עמר": "@Tokyo1987",
  "עייש": "@talayash",
  "קלי": "@kalimeromit"
};

function checkNameTags(text) {
  const username = Object.keys(NAME_TAGS).find(un => text.toLowerCase().includes(un.toLowerCase()));
  return username ? NAME_TAGS[username] : null;
}

// 🧮 חישוב XP לכל הודעה
function calculateXP(text) {
  return Math.min(text.length, 25); // הגבלה ל־25 XP להודעה
}

// 🚀 עדכון XP ורמות במסד הנתונים
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

  data.xp += calculateXP(user.message?.text || "");
  const xpNeeded = data.level * 100;

  let leveledUp = false;
  if (data.xp >= xpNeeded) {
    data.level++;
    data.xp -= xpNeeded;
    leveledUp = true;
  }

  await ref.set(data, { merge: true });
  return leveledUp ? data.level : null;
}

// 🎮 תצוגת פרופיל אישי (INLINE)
function getLevelBadge(level) {
  if (level >= 30) return { badge: "👑", title: "אלוף" };
  if (level >= 20) return { badge: "🔥", title: "וותיק" };
  if (level >= 10) return { badge: "🟣", title: "שחקן רציני" };
  if (level >= 5) return { badge: "🔵", title: "עולה שלב" };
  return { badge: "🟢", title: "מתחיל" };
}

function createXPBar(current, max) {
  const percent = Math.floor((current / max) * 10);
  return `[${"█".repeat(percent)}${"░".repeat(10 - percent)}]`;
}

async function getUserLevelCanvas(bot, userId) {
  const doc = await db.collection("levels").doc(userId.toString()).get();
  if (!doc.exists) return null;

  const data = doc.data();
  const profile = await bot.api.getUserProfilePhotos(userId).catch(() => null);
  const photo = profile?.photos?.[0]?.[0]?.file_id;

  const { badge, title } = getLevelBadge(data.level);
  const xpBar = createXPBar(data.xp, data.level * 100);

  const text = `
<b>${badge} ${data.fullName}</b>
🏆 רמה: <b>${data.level}</b> (${title})
📈 XP: ${data.xp}/${data.level * 100}
${xpBar}
`.trim();

  return { text, photo };
}

function handleInline(bot) {
  bot.command("inline", async (ctx) => {
    const result = await getUserLevelCanvas(bot, ctx.from.id);
    if (!result) {
      return ctx.reply("😕 אין נתונים עדיין. כתוב קצת בצ'אט כדי להתקדם.");
    }

    const { text, photo } = result;

    if (photo) {
      await ctx.replyWithPhoto(photo, {
        caption: text,
        parse_mode: "HTML"
      });
    } else {
      await ctx.reply(text, { parse_mode: "HTML" });
    }
  });
}

function getLevelEmoji(index) {
  return ["🥇", "🥈", "🥉", "🏅", "🎖️"][index] || "🔸";
}

function createShortBar(current, max) {
  const percent = Math.floor((current / max) * 5);
  return `${"█".repeat(percent)}${"░".repeat(5 - percent)}`;
}

function handleTop(bot) {
  bot.command("top", async (ctx) => {
    const snapshot = await db.collection("levels").get();
    if (snapshot.empty) return ctx.reply("😕 אין עדיין משתמשים עם XP.");

    const top = snapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          name: data.fullName || "לא ידוע",
          level: data.level || 1,
          xp: data.xp || 0,
          totalXp: (data.level || 1) * 100 + (data.xp || 0)
        };
      })
      .sort((a, b) => b.totalXp - a.totalXp)
      .slice(0, 5);

    let text = `🏆 <b>טבלת הרמות של שמעון</b>\n━━━━━━━━━━━━━\n`;
    top.forEach((u, i) => {
      const emoji = getLevelEmoji(i);
      const bar = createShortBar(u.xp, u.level * 100);
      text += `${emoji} <b>${u.name}</b>\nרמה ${u.level} • XP: ${u.xp}/${u.level * 100}\n${bar}\n━━━━━━━━━━━━━\n`;
    });

    await ctx.reply(text.trim(), { parse_mode: "HTML" });
  });
}

module.exports = {
  updateXP,
  checkNameTags,
  handleInline,
  handleTop
};
