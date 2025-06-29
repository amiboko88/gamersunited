require("dotenv").config();
const { Bot, webhookCallback } = require("grammy");
const express = require("express");
const { OpenAI } = require("openai");
const { analyzeTextForRoast } = require("./roastTelegram");
const db = require("./utils/firebase");
const registerCommands = require("./telegramCommands");
const { registerBirthdayHandler, validateBirthday, saveBirthday } = require("./telegramBirthday");
const { updateXP, handleTop, registerTopButton } = require("./telegramLevelSystem");
const handleSmartReply = require("./shimonSmart");
const { sendBirthdayMessages } = require("./birthdayNotifierTelegram");
const { registerRoastButtons } = require("./roastTelegram");

const WAITING_USERS = new Map();
const bot = new Bot(process.env.TELEGRAM_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

registerCommands(bot, WAITING_USERS);
registerBirthdayHandler(bot, WAITING_USERS);
handleTop(bot);
registerTopButton(bot);
registerRoastButtons(bot);

const activeDialog = { users: new Set(), timeout: null };
const lastMessagesMap = new Map();
const spamCountMap = new Map();
const lastReplyTimestamps = new Map();
const blockedUsers = new Map();

const fallbackReplies = [
  "יאללה, תתאמץ — שמעון לא מגיב להודעות חלשות.",
  "זה כל מה שיש לך? אכזבה.",
  "תחזור כשתהיה לך שאלה אמיתית.",
  "אני לא רובוט לתשובות סתמיות, אחי.",
  "אפילו יוגי לא היה מגיב לזה.",
];

// חסימת משתמשים שמציפים
async function shouldBlockUserWithGPT(ctx) {
  const userId = ctx.from.id;
  const now = Date.now();
  const text = ctx.message.text?.trim();
  if (!text || text.length < 2) return false;

  const blockUntil = blockedUsers.get(userId);
  if (blockUntil && now < blockUntil) return true;

  const last = lastReplyTimestamps.get(userId) || 0;
  if (now - last < 10000) {
    blockedUsers.set(userId, now + 60000);
    const name = ctx.from.first_name || "חבר";

    const prompt = `
המשתמש ${name} שולח הודעות בתדירות גבוהה מדי (פחות מ־10 שניות בין הודעות).
תגיב אליו בסגנון שמעון – חכם, בוטה, חד, אבל בלי לקלל. שורה אחת בלבד שתחנוק אותו.
`;

    try {
      const gptRes = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.85,
        max_tokens: 50,
      });

      const reply = gptRes.choices?.[0]?.message?.content?.trim();
      if (reply) await ctx.reply(reply, { parse_mode: "HTML" });
    } catch (err) {
      console.error("❌ GPT חסימה:", err);
    }

    return true;
  }

  lastReplyTimestamps.set(userId, now);
  return false;
}

// פקודת birthday ידנית
bot.command("birthday", async (ctx) => {
  WAITING_USERS.set(ctx.from.id, "add");
  await ctx.reply("שלח לי את תאריך יום ההולדת שלך בפורמט 28.06.1993 או כתוב 'ביטול'.");
});

bot.on("message", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text?.trim() || "";
  const isSticker = !!ctx.message.sticker;

  // חסימה לספאמרים
  if (await shouldBlockUserWithGPT(ctx)) return;

  // מצב הזנת יום הולדת
  if (WAITING_USERS.has(userId)) {
    const mode = WAITING_USERS.get(userId);
    if (["ביטול", "בטל", "cancel"].includes(text.toLowerCase())) {
      WAITING_USERS.delete(userId);
      return ctx.reply("ביטלת עדכון יום הולדת. אפשר תמיד לנסות שוב דרך /birthday 🎂");
    }
    if (mode === "add") {
      const bday = validateBirthday(text);
      if (!bday) {
        return ctx.reply("זה לא תאריך תקין. שלח תאריך כמו 28.06.1993, או 'ביטול' לביטול.");
      }
      try {
        await saveBirthday(ctx.from, bday);
        await ctx.reply("נשמר! מחכה לחגוג איתך – צפה לצלייה קולית משמעון 🎉");
      } catch (err) {
        console.error("❌ שגיאה בשמירת יום הולדת:", err);
        await ctx.reply("משהו נדפק, נסה שוב מאוחר יותר 😵");
      } finally {
        WAITING_USERS.delete(userId);
      }
      return;
    }
    return;
  }

  // ❌ התעלמות רק מפקודות, סטיקרים, אמוג'ים או ריקים
  if (text.startsWith("/") || isSticker || !text || /^[\p{Emoji}]+$/u.test(text)) return;

  const lastMsg = lastMessagesMap.get(userId) || "";
  if (lastMsg === text) {
    const spamCount = (spamCountMap.get(userId) || 0) + 1;
    spamCountMap.set(userId, spamCount);
    if (spamCount >= 3) {
      return ctx.reply("שמעון מזהיר: להדביק שוב ושוב את אותו דבר? לא חכם. 😤");
    }
    return;
  } else {
    lastMessagesMap.set(userId, text);
    spamCountMap.set(userId, 0);
  }

  // 🔥 תגובת Roast
  const roast = await analyzeTextForRoast(text);
  if (roast) return await ctx.reply(roast, { parse_mode: "HTML" });

  // 🧠 תשובה חכמה
  const smart = await handleSmartReply(ctx);
  if (smart) return;

  // 🤝 זיהוי שיחה קבוצתית
  activeDialog.users.add(userId);
  if (activeDialog.timeout) clearTimeout(activeDialog.timeout);

  if (activeDialog.users.size >= 2) {
    activeDialog.timeout = setTimeout(async () => {
      const users = Array.from(activeDialog.users)
        .map((id) => `<a href="tg://user?id=${id}">👤</a>`)
        .join(" ");

      const count = activeDialog.users.size;
      const reactions = {
        2: "דו־שיח מיותר... לכו תתכתבו בפרטי.",
        3: "שיח משולש שלא הוביל לכלום. בזבוז ביטים.",
        4: "יותר מדי דעות, אפס מסקנות. יאללה ביי.",
      };
      const message = reactions[count] || "קבוצת חפירות ברמה של פייסבוק 2011.";

      await ctx.reply(`${users}\nשמעון קובע: "${message}"`, { parse_mode: "HTML" });

      activeDialog.users.clear();
      activeDialog.timeout = null;
    }, 25000);
    return;
  }

  // ✅ עדכון XP אמיתי
  const { leveledUp, addedXp } = await updateXP({
    id: ctx.from.id,
    first_name: ctx.from.first_name,
    username: ctx.from.username,
    text
  }, ctx);

  // 🧱 fallback
  await ctx.reply(fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)]);
});

// 🎂 שליחת ברכות יומיות
const now = new Date();
const millisUntilNine = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0) - now;
setTimeout(() => {
  sendBirthdayMessages();
  setInterval(sendBirthdayMessages, 24 * 60 * 60 * 1000);
}, Math.max(millisUntilNine, 0));

// 🌐 Webhook
if (process.env.RAILWAY_STATIC_URL) {
  const app = express();
  const path = "/telegram";
  app.use(express.json());
  app.use(path, webhookCallback(bot, "express"));

  const fullUrl = `${process.env.RAILWAY_STATIC_URL}${path}`;
  bot.api.setWebhook(fullUrl).then(() => {
    console.log(`✅ Webhook נרשם בהצלחה: ${fullUrl}`);
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`🚀 מאזין לטלגרם בפורט ${port}`);
  });
} else {
  console.error("❌ חסר RAILWAY_STATIC_URL");
}
