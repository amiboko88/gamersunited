// 📁 tts/ttsQuotaManager.js – מעקב מגבלות TTS ו־Fallback ל־Gemini Flash

const admin = require('firebase-admin');

const DAILY_CHAR_LIMIT = 10000;
const DAILY_CALL_LIMIT = 15;
const MONTHLY_CHAR_LIMIT = 300000;

function getDateKey() {
  return new Date().toISOString().split('T')[0];
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function getTTSQuotaReport() {
  try {
    const db = admin.firestore();
    const dateKey = getDateKey();
    const monthKey = getMonthKey();

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

async function shouldUseFallback() {
  const report = await getTTSQuotaReport();
  if (!report) return true;

  const nearingLimit = report.dailyCharacters.used >= report.dailyCharacters.limit * 0.9 ||
                       report.monthlyCharacters.used >= report.monthlyCharacters.limit * 0.9 ||
                       report.dailyCalls.used >= report.dailyCalls.limit * 0.9;
  return nearingLimit;
}

module.exports = {
  getTTSQuotaReport,
  shouldUseFallback
};
