// 📁 utils/ttsStatsImage.js – גרף סטטוס מתקדם של TTS כמו MVP

const { createCanvas } = require('canvas');
const admin = require('firebase-admin');

const WIDTH = 1000;
const HEIGHT = 562;

function getColorByPercent(p) {
  if (p >= 1) return '#ff3333'; // אדום
  if (p >= 0.9) return '#ffaa00'; // כתום
  return '#00cc66'; // ירוק
}

async function getStatsData() {
  const db = admin.firestore();

  const now = new Date();
  const dateLimit = new Date(Date.now() - 7 * 86400000).toISOString();

  const auditSnap = await db.collection('azureTtsAudit')
    .where('timestamp', '>=', dateLimit)
    .get();

  const usage = {};
  const speakerCount = { shimon: 0, shirley: 0 };
  const userTotals = {};

  auditSnap.forEach(doc => {
    const { timestamp, speaker, length = 0, userId } = doc.data();
    const date = (timestamp || '').split('T')[0];
    usage[date] = (usage[date] || 0) + length;
    speakerCount[speaker] = (speakerCount[speaker] || 0) + length;
    if (userId) userTotals[userId] = (userTotals[userId] || 0) + length;
  });

  const topUsers = Object.entries(userTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const enriched = await Promise.all(topUsers.map(async ([uid, total]) => {
    try {
      const user = await admin.auth().getUser(uid);
      return {
        name: user.displayName || user.email || uid,
        total
      };
    } catch {
      return { name: uid, total };
    }
  }));

  return { usage, speakerCount, topUsers: enriched };
}

function drawProgressBar(ctx, x, y, w, h, percent, label) {
  const color = getColorByPercent(percent);
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.min(percent, 1), h);

  ctx.fillStyle = '#fff';
  ctx.font = '20px Assistant';
  ctx.fillText(`${label} – ${(percent * 100).toFixed(1)}%`, x + 10, y + h - 10);
}

function draw(ctx, stats) {
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.font = '32px Assistant';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('🔊 סטטוס השימוש בקול של שמעון', 30, 50);

  // תווים יומיים
  const daily = stats.usage;
  const todayKey = new Date().toISOString().split('T')[0];
  const todayVal = daily[todayKey] || 0;
  drawProgressBar(ctx, 30, 80, 600, 30, todayVal / 15000, '📅 תווים יומיים');

  // תווים חודשיים
  const monthTotal = Object.values(daily).reduce((a, b) => a + b, 0);
  drawProgressBar(ctx, 30, 130, 600, 30, monthTotal / 500000, '🗓️ תווים חודשיים');

  // קריאות
  const calls = Object.keys(daily).length;
  drawProgressBar(ctx, 30, 180, 600, 30, calls / 30, '📞 קריאות יומיות');

  // פילוח שמעון / שירלי
  const totalSpeaker = stats.speakerCount.shimon + stats.speakerCount.shirley || 1;
  const s1 = stats.speakerCount.shimon || 0;
  const s2 = stats.speakerCount.shirley || 0;
  const p1 = Math.round((s1 / totalSpeaker) * 100);
  const p2 = 100 - p1;

  ctx.fillStyle = '#ffffff';
  ctx.font = '24px Assistant';
  ctx.fillText(`🎙️ שמעון: ${p1}% | שירלי: ${p2}%`, 30, 250);

  // TOP משתמשים
  ctx.font = '24px Assistant';
  ctx.fillText('👑 המשתמשים המדברים ביותר:', 650, 80);
  const medals = ['🥇', '🥈', '🥉', '🏅', '🎖️'];

  stats.topUsers.forEach((user, i) => {
    ctx.fillText(`${medals[i] || '👤'} ${user.name}: ${user.total} תווים`, 650, 120 + i * 35);
  });
}

async function generateTTSImage() {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const stats = await getStatsData();
  draw(ctx, stats);
  return canvas.toBuffer('image/png');
}

module.exports = {
  generateTTSImage
};
