const { getUpcomingBirthdaysText } = require("./telegramBirthday");
const { generateXPProfileCard } = require("./generateXPProfileCard"); 
const db = require("../utils/firebase");
const lastStartCommand = new Map(); // userId -> timestamp
const { generateRoastText } = require("./generateRoastText");
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = function registerTelegramCommands(bot, WAITING_USERS) {
  const nameOf = (ctx) => ctx.from?.first_name || "חבר";
  bot.api.setMyCommands([
    { command: "start", description: "🚀 פתיחת תפריט ראשי" }
  ]);

  // 🎛️ תפריט ראשי
bot.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  const now = Date.now();
  const lastTime = lastStartCommand.get(userId) || 0;

  // 📛 אם שולח שוב תוך פחות מ־15 שניות – עקיצה במקום תפריט
if (now - lastTime < 15000) {
  const prompt = `משתמש מריץ שוב ושוב את הפקודה /start. תן לו עקיצה קצרה, חכמה, בסגנון שמעון. בלי לקלל.`;
  try {
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.85,
      max_tokens: 60
    });

    let reply = gptRes.choices?.[0]?.message?.content?.trim();

    // ✅ ניקוי מירכאות, רווחים, יישור לימין
    reply = (reply || "יאללה מספיק עם ה־/start הזה אחי.")
      .replace(/^["“”'`׳"״\s]+|["“”'`׳"״\s]+$/g, "").trim();
    reply = `\u200F${reply}`;

    return ctx.reply(reply, { parse_mode: "HTML" });
  } catch (err) {
    console.error("❌ GPT עקיצה /start:", err);
    return ctx.reply("תפריט כבר פתוח, תנשום.");
  }
}


  // ✅ תפריט רגיל
  lastStartCommand.set(userId, now);

  await ctx.reply("ברוכים הבאים לתפריט של שמעון ", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎂 ניהול ימי הולדת", callback_data: "menu_birthdays" },
          { text: "🧑‍💼 פרופיל אישי", callback_data: "menu_profile" }
        ],
        [
          { text: "🧠 שמעון מדגים", callback_data: "menu_demos" }
        ]
      ]
    }
  });
});


  // 🎂 תפריט ימי הולדת
  bot.callbackQuery("menu_birthdays", async (ctx) => {
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎉 הוסף/עדכן יום הולדת", callback_data: "bday_update" }],
          [{ text: "📆 ימי הולדת קרובים", callback_data: "show_upcoming_birthdays" }],
          [{ text: "🔙 חזרה", callback_data: "menu_back" }]
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  // 🧑‍💼 תפריט פרופיל
  bot.callbackQuery("menu_profile", async (ctx) => {
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧬 פרופיל XP", callback_data: "profile_xp" }],
          [{ text: "🏆 טבלת TOP", callback_data: "profile_top" }],
          [{ text: "⭐ MVP מהדיסקורד", callback_data: "profile_mvp" }],
          [{ text: "🔙 חזרה", callback_data: "menu_back" }]
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

bot.callbackQuery("profile_xp", async (ctx) => {
  const userId = ctx.from.id.toString();
  const name = ctx.from.first_name || "חבר";
  const userRef = db.collection("levels").doc(userId);
  const doc = await userRef.get();

  if (!doc.exists || (!doc.data()?.xp && !doc.data()?.level)) {
    await ctx.reply("😕 אין נתונים עדיין. תכתוב קצת בצ'אט כדי להתקדם.");
  } else {
    try {
      // 🖼️ שליפת תמונת פרופיל מהטלגרם
      let avatarURL = "https://i.imgur.com/1QgrNNw.png"; // ברירת מחדל
      try {
        const photos = await ctx.getUserProfilePhotos();
        if (photos.total_count > 0) {
          const fileId = photos.photos[0][0].file_id;
          const link = await ctx.telegram.getFileLink(fileId);
          avatarURL = link.href;
        }
      } catch (err) {
        console.warn("⚠️ לא ניתן לשלוף תמונת פרופיל:", err.message);
      }

      const data = doc.data();
      const buffer = await generateXPProfileCard({
        ...data,
        fullName: name,
        avatarURL
      });

      await ctx.replyWithPhoto(
        { source: buffer },
        {
          caption: "🧬 <b>הפרופיל שלך:</b>",
          parse_mode: "HTML"
        }
      );
    } catch (err) {
      console.error("❌ שגיאה בפרופיל גרפי:", err);
      await ctx.reply("😵 שגיאה זמנית. נסה שוב.");
    }
  }

  await ctx.answerCallbackQuery();
});


  // MVP מדיסקורד
  bot.callbackQuery("profile_mvp", async (ctx) => {
    try {
      const doc = await db.collection("leaderboard").doc("mvp").get();
      const mvpImage = doc.data()?.url;
      if (!mvpImage) return ctx.reply("🤷‍♂️ אין MVP מעודכן כרגע.");

      await ctx.replyWithPhoto(mvpImage, {
        caption: "👑 <b>MVP מהשרת בדיסקורד</b>\nנלקח אוטומטית מהלידרבורד.",
        parse_mode: "HTML"
      });
    } catch (err) {
      console.error("שגיאה בשליפת MVP:", err);
      await ctx.reply("😵 משהו נדפק. נסה שוב מאוחר יותר.");
    }
    await ctx.answerCallbackQuery();
  });

  // ימי הולדת קרובים
  bot.callbackQuery("show_upcoming_birthdays", async (ctx) => {
    const text = await getUpcomingBirthdaysText();
    await ctx.reply(text, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
  });

  // הוספת יום הולדת
  bot.callbackQuery("bday_update", async (ctx) => {
    WAITING_USERS.set(ctx.from.id, "add");
    await ctx.reply("📆 שלח תאריך יום הולדת שלך בפורמט 28.06.1993 או כתוב 'ביטול'.");
    await ctx.answerCallbackQuery();
  });

  // חזרה
  bot.callbackQuery("menu_back", async (ctx) => {
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎂 ניהול ימי הולדת", callback_data: "menu_birthdays" },
            { text: "🧑‍💼 פרופיל אישי", callback_data: "menu_profile" }
          ],
          [
            { text: "🧠 שמעון מדגים", callback_data: "menu_demos" }
          ]
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  // 🧠 תפריט הדגמות
  bot.callbackQuery("menu_demos", async (ctx) => {
    await ctx.editMessageReplyMarkup({
      reply_markup: {
        inline_keyboard: [
          [{ text: "🤖 תיוג חכם", callback_data: "demo_tags" }],
          [{ text: "🔥 ירידת GPT", callback_data: "demo_roast" }],
          [{ text: "🎧 קול של שמעון", callback_data: "demo_voice" }],
          [{ text: "🔙 חזרה", callback_data: "menu_back" }]
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

 // 🤖 תיוג
bot.callbackQuery("demo_tags", async (ctx) => {
  await ctx.reply(
    `🤖 <b>תיוגים חכמים</b>

שמעון מזהה שמות כמו:
• 'קלימרו' → תגובה לעגנית
• 'עומרי עמר' → תיוג @Tokyo1987

🧠 זה פועל אוטומטית בכל שיחה`,
    { parse_mode: "HTML" }
  );
  await ctx.answerCallbackQuery();
});


  // 🔥 ירידה חיה
bot.callbackQuery("demo_roast", async (ctx) => {
  const name = ctx.from.first_name || "חבר";
  const roast = await generateRoastText(name);

  const cleanRoast = roast
    .replace(/^["“”'`׳"״\s]+|["“”'`׳"״\s]+$/g, "").trim();
  const rtlRoast = `\u200F${cleanRoast}`;

  await ctx.reply(`🧠 דוגמת ירידה:\n\n<b>${rtlRoast}</b>`, {
    parse_mode: "HTML"
  });
});



// 🎧 קול של שמעון – עם הגנה מלאה
const { generateRoastVoice } = require("./telegramTTSRoaster");
const runningVoiceUsers = new Set();

bot.callbackQuery("demo_voice", async (ctx) => {
  const userId = ctx.from.id;

  // ✅ מניעת לחיצה כפולה
  if (runningVoiceUsers.has(userId)) {
    return ctx.answerCallbackQuery({
      text: "⏳ כבר מופעל... חכה שההקלטה תגיע 🎤",
      show_alert: false
    }).catch(() => {});
  }

  runningVoiceUsers.add(userId);

  // ✅ תגובה מיידית למניעת timeout
  await ctx.answerCallbackQuery({ text: "🎧 מתחילים...", show_alert: false }).catch(() => {});

  try {
    await ctx.reply("🔊 שמעון מתחמם... מחולל קול מופעל 🎤");
    await generateRoastVoice(ctx);
  } catch (err) {
    console.error("🎤 שגיאה במחולל קול:", err);
    await ctx.reply("😵 שמעון שתק הפעם. נסה שוב מאוחר יותר.");
  } finally {
    runningVoiceUsers.delete(userId); // שחרור ללחיצה הבאה
  }
});
};
