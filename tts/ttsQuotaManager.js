// 📁 tts/ttsQuotaManager.js – ניהול מגבלות TTS, רישום שימוש, ו־Fallback ל־Gemini/OpenAI

const admin = require('firebase-admin');

const DAILY_CHAR_LIMIT = 10000;
const DAILY_CALL_LIMIT = 15;
const MONTHLY_CHAR_LIMIT = 300000;

// פונקציות עזר
function getDateKey() {
  return new Date().toISOString().split('T')[0];
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// קבלת סטטיסטיקת שימוש
async function getTTSQuotaReport() {
  try {
    const db = admin.firestore();
    const dateKey = getDateKey();
    const monthKey = getMonthKey();

    // שמרנו את אותו שם אוסף – אפשר להחליף ל־'ttsUsage' אם תרצה להפריד (למשל openai/גמיני)
    const dailyRef = db.collection('geminiTtsUsage').doc(`daily-${dateKey}`);
    const monthlyRef = db.collection('geminiTtsUsage').doc(`monthly-${monthKey}`);

    const [dailySnap, monthlySnap] = await Promise.all([
      dailyRef.get(),
      monthlyRef.get()
    ]);

    const daily = dailySnap.exists ? dailySnap.data() : {};
    const monthly = monthlySnap.exists ? monthlySnap.data() : {};

    const dailyCharacters = typeof daily.totalCharacters === 'number' ? daily.totalCharacters : 0;
    const dailyCalls = typeof daily.totalCalls === 'number' ? daily.totalCalls : 0;
    const monthlyCharacters = typeof monthly.totalCharacters === 'number' ? monthly.totalCharacters : 0;

    return {
      dailyCharacters: {
        used: dailyCharacters,
        limit: DAILY_CHAR_LIMIT
      },
      dailyCalls: {
        used: dailyCalls,
        limit: DAILY_CALL_LIMIT
      },
      monthlyCharacters: {
        used: monthlyCharacters,
        limit: MONTHLY_CHAR_LIMIT
      }
    };
  } catch (err) {
    console.error('❌ שגיאה ב־getTTSQuotaReport:', err);
    return null;
  }
}

// האם צריך לעבור ל־Fallback לפי מגבלות?
async function shouldUseFallback() {
  const report = await getTTSQuotaReport();
  if (!report) return true;

  const nearingLimit = report.dailyCharacters.used >= report.dailyCharacters.limit * 0.9 ||
                       report.monthlyCharacters.used >= report.monthlyCharacters.limit * 0.9 ||
                       report.dailyCalls.used >= report.dailyCalls.limit * 0.9;
  return nearingLimit;
}

// ✅ רישום שימוש אמיתי ב־TTS (תווים/קריאות)
async function registerTTSUsage(chars = 0, calls = 1) {
  try {
    const db = admin.firestore();
    const dateKey = getDateKey();
    const monthKey = getMonthKey();

    const dailyRef = db.collection('geminiTtsUsage').doc(`daily-${dateKey}`);
    const monthlyRef = db.collection('geminiTtsUsage').doc(`monthly-${monthKey}`);

    await Promise.all([
      dailyRef.set({
        totalCharacters: admin.firestore.FieldValue.increment(chars),
        totalCalls: admin.firestore.FieldValue.increment(calls),
        lastUpdated: new Date().toISOString()
      }, { merge: true }),
      monthlyRef.set({
        totalCharacters: admin.firestore.FieldValue.increment(chars),
        lastUpdated: new Date().toISOString()
      }, { merge: true })
    ]);
  } catch (e) {
    console.error('❌ שגיאה ברישום שימוש TTS:', e.message);
  }
}

module.exports = {
  getTTSQuotaReport,
  shouldUseFallback,
  registerTTSUsage
};
