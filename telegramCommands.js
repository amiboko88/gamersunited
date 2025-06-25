const { getUserLevelCanvas } = require("./telegramLevelSystem");
const { getUpcomingBirthdaysText } = require("./telegramBirthday");
const db = require("./utils/firebase");

// פונקציה לירידה חיה מ-GPT
const generateRoast = async (name) => {
  const prompt = `כתוב ירידת צחוק שנונה, עוקצנית אך קלילה, עבור מישהו בשם "${name}". בלי קללות ישירות, אבל שתגרום לו לחשוב פעמיים לפני שיגיב שוב.`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9
    })
  });

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || "התגובה לא עבדה הפעם 😅";
};

module.exports = function registerTelegramCommands(bot, WAITING_USERS) {
  const nameOf = (ctx) => ctx.from?.first_name || "חבר";
  const idOf = (ctx) => ctx.from?.id?.toString() || "";

  bot.api.setMyCommands([
    { command: "start", description: "🚀 פתיחת תפריט ראשי" }
  ]);

  // 🎛️ תפריט ראשי
  bot.command("start", async (ctx) => {
    await ctx.reply("🎛️ תפריט ראשי של שמעון:", {
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

  // 🧬 פרופיל XP
  bot.callbackQuery("profile_xp", async (ctx) => {
    const result = await getUserLevelCanvas(bot, ctx.from.id);
    if (!result) return ctx.reply("😕 אין נתונים עדיין. כתוב קצת בצ'אט כדי להתקדם.");

    const { text, photo } = result;
    if (photo) {
      await ctx.replyWithPhoto(photo, { caption: text, parse_mode: "HTML" });
    } else {
      await ctx.reply(text, { parse_mode: "HTML" });
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
    const name = nameOf(ctx);
    const roast = await generateRoast(name);
    await ctx.reply(`🧠 דוגמת ירידה:\n\n<b>${name}</b> – ${roast}`, {
      parse_mode: "HTML"
    });
    await ctx.answerCallbackQuery();
  });

  // 🎧 קול של שמעון (הדגמה טקסטואלית לעכשיו)
const { generateRoastVoice } = require("./telegramTTSRoaster");

bot.callbackQuery("demo_voice", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("🎧 מחולל ירידה בקול מופעל... תכף זה מגיע 🔊");
  await generateRoastVoice(ctx);
});

};
