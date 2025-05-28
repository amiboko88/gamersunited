// 📁 telegramTriggers.js – כולל mentionTriggers ושיפורים לעברית + עיצוב HTML

const linkRegex = /(https?:\/\/[^\s]+)/i;

const linkReplies = [
  "מה זה הלינק הזה יא נואש? 🔗",
  "עוד פעם לינק? תלמד לחיות בעולם האמיתי 🔗",
  "אם זה לא קשור ל־Warzone תמחוק את זה מיד 🔗",
  "שמעתי שיש טיפול לקליק־מחלה 🔗",
  "אם זה פורנו – לפחות שתף עם תיאור 🔗",
  "אם זה חינמי – שלח לי בפרטי 🔗",
  "שמעון מוחק נקודות כל פעם שאתה משתף ככה 🔗",
  "המשטרה כבר איתך על הקו 🔗",
  "שולח לינקים כמו אימא שלך בבוקר 🔗",
  "כבר עדיף שתשלח גיף של פיצה 🔗",
  "כל פעם שאתה שולח לינק, יוגי מפסיד ב־Rocket League 🔗",
  "רועי פרש מהקבוצה בגלל זה 🔗",
  "שולח לינק וחושב שסיים את תפקידו 🔗",
  "העולם לא מוכן למה ששלחת כרגע 🔗",
  "לינק בלי להסביר – בושה וחרפה 🔗",
  "כנראה יש לך יותר לינקים ממילים 🔗",
  "לינק בלי קונטקסט? זה כמו תירוץ בלי מוות 🔗",
  "העכבר שלך מחליק על הלינקים מרוב יאוש 🔗",
  "נו באמת, לינק במקום לתייג? 🔗"
];

const keywordTriggers = {
  משחק: [
    "מי משחק? כנראה לא אתה... 🎮",
    "תשאל את אמא אם מותר לך לשחק 🎮",
    "שואל כל שבוע, לא מחובר אף פעם 🎮",
    "הגיע הזמן שתפסיק לשאול ותתחיל לפעול 🎮",
    "שמעון שונא חוסר החלטיות. תיכנס או תשתוק 🎮",
    "שוב אתה עם השאלה הזאת? תשתנה כבר 🎮",
    "תבדוק אם הכבל של המיקרופון מחובר קודם 🎮",
    "אתה שואל 'מי משחק' כבר 3 שנים. תבין לבד 🎮",
    "רועי עסוק ב־Helldivers 2, יוגי שוב ברוקט ליג 🎮",
    "המשחק היחיד שאתה מוביל בו זה מחבואים מהעכבר 🎮"
  ],
  עולה: [
    "הקבוצה לא צריכה אותך ⬆️",
    "אף אחד לא ביקש שתעלה ⬆️",
    "אתה עולה? תוודיע שנכבה שרת ⬆️",
    "שמעון לא מאשר עלייה בלי אישור מילואים ⬆️",
    "פחות הודעות, יותר עליות ⬆️",
    "בוא נראה אותך עולה באמת, לא רק מדבר ⬆️",
    "מתי בפעם האחרונה באמת עלית? ⬆️",
    "השרת רועד מרוב עליות מזויפות ⬆️",
    "עלית? רואים – לפי התירוצים שלך ⬆️",
    "תעלה – אבל בשקט. שמעון מאזין ⬆️"
  ],
  מחובר: [
    "שמעון תמיד מחובר. אתה לא. 📶",
    "מחובר בלב, מנותק באייפון 📶",
    "מחובר? גם אני. אז מה? 📶",
    "שוב אתה בודק אם מישהו רואה אותך 📶",
    "תתנתק ותתחבר לחיים האמיתיים 📶",
    "החיבור שלך פחות יציב מהמיקרופון של מתן 📶",
    "אם היית באמת מחובר, היית שקט כבר 📶",
    "מחובר, אבל בנשמה לא במשחק 📶",
    "חיברת גם את האוזניות או רק את העצבים? 📶"
  ],
  אחי: [
    "אני לא אח שלך. דבר ברור. 🤨",
    "פעם אחרונה שמישהו קרא לי אחי, זה נגמר במיוט 🤨",
    "שמעון לא אוהב אחוקים. רק גברים 🤨",
    "תגיד אחי עוד פעם אחת ואני שולח אותך לגולאג 🤨",
    "תגיד שם, לא אחי. שמור על כבוד 🤨",
    "אחי אחי אחי... נמאס 🤨",
    "פעם קראו לי אחי. עכשיו הם שותקים 🤨",
    "יאללה, אחי... לך תעשה משהו עם עצמך 🤨",
    "שמעון לא מתחבר למי שקורא לו אחי 🤨"
  ]
};

const mentionTriggers = [
  "מה אתה רוצה ממני בדיוק? 🤔",
  "תתמודד לבד פעם אחת 🤷‍♂️",
  "שוב אתה עם התיוגים? 🤨",
  "אני פה רק לצחוק עליך, לא לעזור 😎",
  "השתמשת בתג? קח נביחה 🐶",
  "תיוג זה לחלשים 💢",
  "יש לך בעיה? דבר עם עצמך 🪞",
  "שמעון עסוק בלצחוק על אחרים כרגע 🤡",
  "תיוג מיותר. כאילו שאני אכפת לי 🤖",
  "כל תיוג מוריד לך נקודות FIFO 🧾",
  "תיוג אותי? מקווה שאתה גם מבשל 🍳",
  "שמעון לא עוזר. שמעון עוקץ. 💉"
];

let lastMessageTimestamp = 0;
let dailyReminderSent = false;

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function handleTrigger(ctx) {
  const text = ctx.message?.text?.toLowerCase() || "";
  const name = ctx.from?.first_name || "חבר";

// ✅ זיהוי מתוחכם: לא כל מופע של "שמעון" יפעיל טריגר
const triggerWords = ['שמעון', 'bot', 'בוט', 'שימי', 'שמשון'];
const isMention = triggerWords.some(word => {
  const isAlone = text.trim() === word;
  const isShortPing = text.trim().startsWith(word) && text.split(" ").length <= 3;
  return isAlone || isShortPing;
});


  if (isMention) {
    ctx.reply(`\u200F<b>${name}</b> – ${getRandom(mentionTriggers)}`, { parse_mode: "HTML" });
    lastMessageTimestamp = Date.now();
    return { triggered: true, type: 'mention' };
  }

  // 🔗 לינק
  if (linkRegex.test(text)) {
    ctx.reply(`\u200F<b>${name}</b> – ${getRandom(linkReplies)}`, { parse_mode: "HTML" });
    lastMessageTimestamp = Date.now();
    return { triggered: true, type: 'link' };
  }

  // 🧠 מילות מפתח
  for (const keyword in keywordTriggers) {
    if (text.includes(keyword)) {
      ctx.reply(`\u200F<b>${name}</b> – ${getRandom(keywordTriggers[keyword])}`, { parse_mode: "HTML" });
      lastMessageTimestamp = Date.now();
      return { triggered: true, type: 'keyword', keyword };
    }
  }

  // 🖼️ תמונה
  if (ctx.message?.photo) {
    ctx.reply(`\u200F<b>${name}</b> – שלחת תמונה – אבל למה? 🖼️`, { parse_mode: "HTML" });
    lastMessageTimestamp = Date.now();
    return { triggered: true, type: 'photo' };
  }

  // 🎭 סטיקר
  if (ctx.message?.sticker) {
    ctx.reply(`\u200F<b>${name}</b> – סטיקר במקום טקסט? שמעון שוקל קיק 🎭`, { parse_mode: "HTML" });
    lastMessageTimestamp = Date.now();
    return { triggered: true, type: 'sticker' };
  }

  lastMessageTimestamp = Date.now();
  return { triggered: false };
}

// ⏰ תזכורת אם לא כתבו כלום מעל 24 שעות
function checkDailySilence(bot, chatId) {
  const hours = (Date.now() - lastMessageTimestamp) / 1000 / 60 / 60;
  if (hours > 24 && !dailyReminderSent) {
    bot.api.sendMessage(chatId, "📢 שקט כזה לא היה מאז שיוגי שבר שלט. מישהו כאן?");
    dailyReminderSent = true;
  }
}

module.exports = {
  handleTrigger,
  checkDailySilence
};
