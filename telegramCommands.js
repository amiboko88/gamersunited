// 📁 telegramCommands.js – גרסה סופית תואמת Webhook + Firestore + Railway

module.exports = function registerTelegramCommands(bot) {
  const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const nameOf = (ctx) => ctx.from?.first_name || "חבר";

  // 📌 רישום Slash Commands ב־BotFather
  bot.api.setMyCommands([
    { command: "start", description: "התחלה וברוך הבא" },
    { command: "help", description: "הצג את כל האפשרויות של הבוט" },
    { command: "prophecy", description: "קבל תחזית פסימית מהבוט" },
    { command: "laugh", description: "שמעון יורד עליך" },
    { command: "compliment", description: "מחמאה גסה במיוחד" },
    { command: "nextmvp", description: "ניחוש מגוחך של שמעון" },
    { command: "why", description: "למה אני כזה גרוע?" },
    { command: "shimon", description: "משפט השראה מרושע" },
    { command: "excuse", description: "תירוץ מביך להפסד שלך" },
    { command: "rage", description: "התפרצות זעם של גיימר מתוסכל" },
    { command: "daily", description: "משפט יומי אכזרי משמעון" }
  ]).catch((err) => console.error("❌ שגיאה ברישום פקודות בטלגרם:", err));

  const replies = {
    prophecy: [
      "היום תמות בגולאג תוך 17 שניות 🤯",
      "הפינג שלך יעלה ל־999 ברגע הכי קריטי 😵‍💫",
      "תתחבר – וכולם יתנתקו 🤡",
      "הגורל שלך: Spectator Mode 🪦",
      "הנבואה: Rage quit תוך 6 דקות 🔮"
    ],
    laugh: [
      "נפלת כמו טונה בלי שמן 🤣",
      "תמחוק את המשחק ותחזור לתיכון 🏫",
      "גם בוטים ב־Easy היו עושים יותר 😬",
      "MVP של התבוסה, כל הכבוד 👏",
      "RIP גאווה גיימרית ⚰️"
    ],
    compliment: [
      "רועי, למרות שאתה רוסי עם שם תימני – אני גאה בך. קצת 🙃",
      "יוגב, אתה לא MVP, אבל לפחות אתה בא לערוצים 👌",
      "מתן, לא הכי טוב, אבל גם לא הכי גרוע. אולי 🤷‍♂️",
      "שמעון – אתה אלוף. ברור, זה אני כותב את זה 😎"
    ],
    nextmvp: [
      "יוגב – כי הוא היחיד שבא 🙃",
      "גילי – בזכות AFK 📉",
      "אביחי – בטעות 🫣",
      "אם מתן לא יירדם – אולי הוא 🛌",
      "פשוט תנו לי את הכתר 👑"
    ],
    why: [
      "כי אתה משחק כמו סבתא בלי משקפיים 👵",
      "זה לא אתה. זו הדינמיקה הקבוצתית (סתם, זה אתה) 🧠",
      "כי אתה לא חבר FIFO רשמית 🪪",
      "כי אתה נעלם תמיד ברגעים החשובים ⛔",
      "כי אתה מת בתפריט של הנשק 🔫"
    ],
    shimon: [
      "לא כל מי שמחובר – מחובר באמת 🧘",
      "תשתוק ותתחבר – אולי תשתפר 📶",
      "אם לא היית כזה גרוע, אולי היית MVP 🏅",
      "שמעון רואה הכל. אפילו את ה־AFK שלך 👀",
      "תשקול לפרוש. או לפחות לשתוק 🤐"
    ],
    excuse: [
      "הנתב קפץ, נשבע 🤞",
      "הכלב דרך לי על המקלדת 🐶",
      "העכבר נתקע, באמת 🖱️",
      "אני משחק עם יד אחת כרגע ✋",
      "הייתי באמצע לאכול בורקס 🥐"
    ],
    rage: [
      "מה זה החרא הזה?! איך זה פגע בי?! 🤬",
      "אין מצב! שקר של המערכת! 😡",
      "אני פורש מהמשחק הזה לנצח! 💥",
      "מי יצר את המפה הזאת?! עיוור?! 👨‍🦯",
      "לא שיחקתי ככה מאז שנות ה־2000 🤯"
    ],
    daily: [
      "דוד, יום ראשון – אין רחמים, רק הפסדים 😤",
      "רועי, יום שני – קמים בשביל להפסיד 😴",
      "יוגב, יום שלישי – שוב אף אחד לא בערוץ 📉",
      "אביחי, יום חמישי – אולי תתחבר היום? 🤨",
      "מתן, שבת – רק שחקנים עם כבוד נשארו 🫡"
    ]
  };

  // 📢 תגובה לכל פקודה
  for (const command in replies) {
    bot.command(command, async (ctx) => {
      try {
        await ctx.reply(`${nameOf(ctx)}, ${getRandom(replies[command])}`);
      } catch (err) {
        console.error(`❌ שגיאה בביצוע /${command}:`, err);
      }
    });
  }

  // 🆘 פקודת /help
  bot.command("help", async (ctx) => {
    await ctx.reply(`📋 ${nameOf(ctx)}, שמעון יודע לעשות את הדברים הבאים:

/prophecy – קבל תחזית פסימית מהבוט  
/laugh – שמעון יורד עליך  
/compliment – מחמאה גסה במיוחד  
/nextmvp – ניחוש מגוחך של שמעון  
/why – למה אני כזה גרוע?  
/shimon – משפט השראה מרושע  
/excuse – תירוץ מביך להפסד שלך  
/rage – התפרצות זעם של גיימר מתוסכל  
/daily – משפט יומי אכזרי משמעון`);
  });

  // ✅ פקודת /start ברורה
  bot.command("start", async (ctx) => {
    await ctx.reply(`${nameOf(ctx)}, ברוך הבא לשמעון הבוט. הקלד /help כדי לראות מה אני יודע לעשות 🤖`);
  });
};
