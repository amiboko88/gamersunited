// 📁 tts/ttsQuotaManager.eleven.js – נותר כפי שהוא (נראה תקין)
const admin = require('firebase-admin');

const DAILY_CHAR_LIMIT = 15000;
const DAILY_CALL_LIMIT = 30;
const MONTHLY_CHAR_LIMIT = 500000;
const COLLECTION_NAME = 'elevenTtsUsage';

function getDateKey() {
  return new Date().toISOString().split('T')[0];
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function getTTSQuotaReport() {
  try {
    // ✅ גישה ל-Firestore דרך admin.firestore() כאן היא תקינה
    const db = admin.firestore();
    const dateKey = getDateKey();
    const monthKey = getMonthKey();

    const dailyRef = db.collection(COLLECTION_NAME).doc(`daily-${dateKey}`);
    const monthlyRef = db.collection(COLLECTION_NAME).doc(`monthly-${monthKey}`);

    const [dailySnap, monthlySnap] = await Promise.all([
      dailyRef.get(),
      monthlyRef.get()
    ]);

    const daily = dailySnap.exists ? dailySnap.data() : {};
    const monthly = monthlySnap.exists ? monthlySnap.data() : {};

    const dailyCharacters = typeof daily.totalCharacters === 'number' ? daily.totalCharacters : 0;
    const dailyCalls = typeof daily.totalCalls === 'number' ? daily.totalCalls : 0;
    const monthlyCharacters = typeof monthly.totalCharacters === 'number' ? monthly.totalCharacters : 0;

    const getStatus = (used, limit) => {
      if (used >= limit) return '🔴 המגבלה נוצלה במלואה';
      if (used >= limit * 0.9) return '🟠 קרוב למגבלה';
      return '🟢 תקין';
    };

    return {
      dailyCharacters: {
        used: dailyCharacters,
        limit: DAILY_CHAR_LIMIT,
        status: getStatus(dailyCharacters, DAILY_CHAR_LIMIT)
      },
      dailyCalls: {
        used: dailyCalls,
        limit: DAILY_CALL_LIMIT,
        status: getStatus(dailyCalls, DAILY_CALL_LIMIT)
      },
      monthlyCharacters: {
        used: monthlyCharacters,
        limit: MONTHLY_CHAR_LIMIT,
        status: getStatus(monthlyCharacters, MONTHLY_CHAR_LIMIT)
      }
    };
  } catch (err) {
    console.error('❌ שגיאה ב־getTTSQuotaReport:', err);
    return null;
  }
}

async function shouldUseFallback() {
  const report = await getTTSQuotaReport();
  if (!report) return true; // אם יש שגיאה, נניח שימוש ב-fallback

  const nearingLimit = report.dailyCharacters.used >= report.dailyCharacters.limit * 0.9 ||
                       report.monthlyCharacters.used >= report.monthlyCharacters.limit * 0.9 ||
                       report.dailyCalls.used >= report.dailyCalls.limit * 0.9;
  return nearingLimit;
}

async function registerTTSUsage(chars = 0, calls = 1) {
  try {
    // ✅ גישה ל-Firestore דרך admin.firestore() כאן היא תקינה
    const db = admin.firestore();
    const dateKey = getDateKey();
    const monthKey = getMonthKey();

    const dailyRef = db.collection(COLLECTION_NAME).doc(`daily-${dateKey}`);
    const monthlyRef = db.collection(COLLECTION_NAME).doc(`monthly-${monthKey}`);

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