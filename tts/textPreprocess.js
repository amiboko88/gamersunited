// 📁 tts/textPreprocess.js – חידוד טקסטים ל־TTS OpenAI

const ttsNikudMap = [
  { from: /FIFO/gi, to: 'פִּיפוֹ' },
  { from: /גיימרים/gi, to: 'גֵיְמֵרִים' },
  { from: /גיימר/gi, to: 'גֵיְמֵר' },
  { from: /אחי/gi, to: 'אַחִי' },
  { from: /וואלה/gi, to: 'וַאלָּה' },
  { from: /אשכרה/gi, to: 'אַשְׁכָּרָה' },
  { from: /מיקרופון/gi, to: 'מִיקְרוֹפוֹן' },
  { from: /קלימרו/gi, to: 'קָלִימֵרוֹ' },
  { from: /רועי/gi, to: 'רוֹעִי' },
  { from: /יוגי/gi, to: 'יוֹגִי' },
  { from: /מתן/gi, to: 'מָתָן' },
  { from: /עמרי/gi, to: 'עָמְרִי' },
  { from: /גלעד/gi, to: 'גִּלְעָד' },
  { from: /אביחי/gi, to: 'אֲבִיחַי' },
  // הוסף עוד מילים קשות/סלנג משלך!
];

// הוספת ניקוד (ותיקון מילים בעייתיות)
function autoNikud(text) {
  let res = text;
  ttsNikudMap.forEach(({from, to}) => {
    res = res.replace(from, to);
  });
  return res;
}

// הוספת פיסוק ועצירות חכמות
function smartPunctuation(text) {
  let res = text.trim();

  // פסיקים אחרי כל מילה בעברית באורך 5+ (להאט)
  res = res.replace(/([א-ת]{5,})/g, '$1,');

  // נקודה כל 2–3 משפטים
  res = res.replace(/([.?!])([^ ])/g, '$1 $2');
  res = res.replace(/([.?!])$/g, '$1 ');

  // לא לאפשר צבירת פסיקים
  res = res.replace(/,+/g, ',');

  // להפוך רצף של שלוש מילים – למעין "עיוות"
  res = res.replace(/([א-ת]{3,}) ([א-ת]{3,}) ([א-ת]{3,})/g, '$1, $2, $3');

  // עצירה דרמטית אחרי סימן קריאה
  res = res.replace(/!/g, '! ...');

  return res;
}

// אפשר להוסיף כאן עיוותים מיוחדים (אותיות מופרדות)
function dramatizeHebrew(text) {
  return text.replace(/(\b[א-ת]{5,}\b)/g, (m) =>
    m.split('').join('-')
  );
}

// המרה סופית
function preprocessTTS(text) {
  let out = text;
  out = autoNikud(out);        // שלב 1 – ניקוד ועיוותים
  out = smartPunctuation(out); // שלב 2 – פיסוק חכם
  // אפשר להפעיל dramatizeHebrew(out) אם רוצים להדגיש שמות/מילים (להשתמש בזהירות)
  return out;
}

module.exports = {
  preprocessTTS
};
