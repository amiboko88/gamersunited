// 📁 ttsQuotaManager.js – מעקב מגבלות TTS ו־Fallback ל־Gemini Flash

const admin = require('firebase-admin');

const DAILY_CHAR_LIMIT = 10000;
const DAILY_CALL_LIMIT = 15;
const MONTHLY_CHAR_LIMIT = 300000;

function getDateKey() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function getTTSUsage() {
  const db = admin.firestore();
  const dateKey = getDateKey();
  const monthKey = getMonthKey();

  const dailyRef = db.doc(`geminiTtsUsage/daily/${dateKey}`);
  const monthlyRef = db.doc(`geminiTtsUsage/monthly/${monthKey}`);

  const [dailySnap, monthlySnap] = await Promise.all([dailyRef.get(), monthlyRef.get()]);
  const daily = dailySnap.exists ? dailySnap.data() : { totalCharacters: 0, totalCalls: 0 };
  const monthly = monthlySnap.exists ? monthlySnap.data() : { totalCharacters: 0 };

  return { daily, monthly };
}

function getUsageStatus(used, limit) {
  const percent = (used / limit) * 100;
  if (percent >= 99) return '🔴 מלא';
  if (percent >= 90) return '🟠 כמעט מלא';
  if (percent >= 80) return '🟡 גבוה';
  if (percent >= 50) return '🟢 בינוני';
  return '🟢 תקין';
}

async function getTTSQuotaReport() {
  const { daily, monthly } = await getTTSUsage();

  return {
    dailyCharacters: {
      used: daily.totalCharacters || 0,
      limit: DAILY_CHAR_LIMIT,
      status: getUsageStatus(daily.totalCharacters || 0, DAILY_CHAR_LIMIT)
    },
    dailyCalls: {
      used: daily.totalCalls || 0,
      limit: DAILY_CALL_LIMIT,
      status: getUsageStatus(daily.totalCalls || 0, DAILY_CALL_LIMIT)
    },
    monthlyCharacters: {
      used: monthly.totalCharacters || 0,
      limit: MONTHLY_CHAR_LIMIT,
      status: getUsageStatus(monthly.totalCharacters || 0, MONTHLY_CHAR_LIMIT)
    }
  };
}

function shouldUseFallback(report) {
  const nearingLimit = report.dailyCharacters.used >= DAILY_CHAR_LIMIT * 0.9
    || report.monthlyCharacters.used >= MONTHLY_CHAR_LIMIT * 0.9;
  return nearingLimit;
}

module.exports = {
  getTTSQuotaReport,
  shouldUseFallback
};
