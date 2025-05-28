// 📁 telegramCurses.js – תגובות לקללות בעברית ואנגלית בלי למחוק כלום

const badWords = [
  // עברית
  "מפגר", "טמבל", "מטומטם", "זבל", "חרא", "מניאק", "קקה", "קקי", "חמור", "אפס", "בן זונה", "שרמוטה", "סתום",
  "כלב", "חלאה", "בהמה", "זונה", "שיט", "מניאק", "חלאס", "פח", "שרמוט", "שטן", "כוס", "חארה",
  // אנגלית
  "fuck", "shit", "bitch", "asshole", "bastard", "dumb", "crap", "fool", "retard", "slut", "jerk", "suck", "moron"
];

const curseReplies = [
  "דבר יפה או תמצא את עצמך ב־Gulag 🎯",
  "הפה שלך יותר מלוכלך מהאוזניות של יוגי 🎧",
  "פחות קללות, יותר ביצועים 🎮",
  "בוא תנסה להגיד את זה בערוץ קולי ונתראה שם 🎤",
  "חינוכית זה לא, אבל לפחות זה מצחיק 😅",
  "שמעון רושם, שוקל מיוט 📋",
  "פעם אחרונה שמישהו קילל פה – הוא נמחק מהשרת 💀",
  "זה שאתה מת לא אומר שצריך לקלל ☠️",
  "כפרה, תלמד להפסיד בכבוד 🕊️",
  "יאללה תשתה מים ותחזור רגוע 🚰",
  "שמעון מחפש את כפתור המחיקה שלך... כמעט שם 🧹"
];

// פונקציית בדיקת קללה ותגובה
function handleCurses(ctx) {
  const text = ctx.message?.text?.toLowerCase() || "";
  const name = ctx.from?.first_name || "חבר";

  for (const word of badWords) {
    if (text.includes(word)) {
      const reply = curseReplies[Math.floor(Math.random() * curseReplies.length)];
      ctx.reply(`${name}, ${reply}`);
      return true;
    }
  }

  return false;
}

module.exports = handleCurses;
