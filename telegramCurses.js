const badWords = [
  "זונה", "בן זונה", "דפוק", "סתום", "חרא", "מטומטם", "אידיוט", "שטן",
  "כוסעמק", "כוסאמאשך", "זין", "שיט", "פאק", "fuck", "shit", "asshole", 
  "bitch", "dick", "suck", "moron", "crap"
];

const fireBackResponses = [
  "רגע, זה נחשב ניסיון לירידה? כי זה היה חלש.",
  "תנסה שוב, אולי הפעם תצליח באמת לפגוע.",
  "הפה שלך יותר מטונף מהכבל של המיקרופון שלך.",
  "חרא של ניסיון, באמת. כמו הגיימינג שלך.",
  "תמשיך ככה – אולי תעוף מהקבוצה לבד.",
  "הטוקבקיסט מהשוק חזר... תתבגר כבר.",
  "וואו. איזה אומץ מאחורי מקלדת.",
  "שמעון לא מתרגש מקללות. רק מעליב יותר טוב.",
  "זה היה אמור להצחיק או להכאיב? כי זה עשה כלום.",
  "גם ילד בן 8 יודע לקלל ככה. תן רגש."
];

function detectAndRespondToSwear(ctx) {
  const text = ctx.message?.text?.toLowerCase() || "";
  const name = ctx.from?.first_name || "חבר";

  for (const word of badWords) {
    if (text.includes(word)) {
      const reply = fireBackResponses[Math.floor(Math.random() * fireBackResponses.length)];
      return ctx.reply(`😈 ${name}, ${reply}`);
    }
  }
}

module.exports = { detectAndRespondToSwear };
