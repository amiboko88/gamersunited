const { createCanvas, registerFont } = require('canvas');
const admin = require('firebase-admin');
const path = require('path');

registerFont(path.join(__dirname, '../assets/NotoSansHebrew-Bold.ttf'), {
  family: 'NotoHebrew'
});

const WIDTH = 900;
const HEIGHT = 500;

function getColor(percent) {
  if (percent >= 1) return '#ff3333';
  if (percent >= 0.9) return '#ffaa00';
  return '#00cc66';
}

async function getStatsData() {
  const db = admin.firestore();
  const usage = {};
  const speakerCount = { shimon: 0, shirley: 0 };
  const userTotals = {};

  const auditSnap = await db.collection('azureTtsAudit')
    .where('timestamp', '>=', new Date(Date.now() - 7 * 86400000).toISOString())
    .get();

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

function drawBar(ctx, x, y, width, height, percent, label) {
  const barWidth = Math.min(percent, 1) * width;
  const bgColor = '#3a3a3a';
  const fillColor = getColor(percent);

  // רקע
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, width, height);

  // פס צבעוני
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, barWidth, height);

  // טקסט על הבר
  ctx.fillStyle = '#ffffff';
  ctx.font = '24px NotoHebrew';
  ctx.textAlign = 'left';
  ctx.fillText(`${(percent * 100).toFixed(1)}%`, x + width + 10, y + height - 6);
  ctx.textAlign = 'right';
  ctx.fillText(label, x - 10, y + height - 6);
}

function draw(ctx, stats) {
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = '34px NotoHebrew';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('סטטוס השימוש בקול של שמעון', WIDTH - 30, 60);

  // מדדים
  const yStart = 100;
  const barHeight = 32;
  const barGap = 45;
  const barWidth = 500;
  const xBar = WIDTH - 60 - barWidth;

  const usageToday = stats.usage[new Date().toISOString().split('T')[0]] || 0;
  const usageMonth = Object.values(stats.usage).reduce((a, b) => a + b, 0);
  const callsToday = Object.keys(stats.usage).length;

  drawBar(ctx, xBar, yStart + barGap * 0, barWidth, barHeight, usageToday / 15000, 'תווים יומיים');
  drawBar(ctx, xBar, yStart + barGap * 1, barWidth, barHeight, usageMonth / 500000, 'תווים חודשיים');
  drawBar(ctx, xBar, yStart + barGap * 2, barWidth, barHeight, callsToday / 30, 'קריאות יומיות');

  // פילוח שמעון/שירלי
  const total = stats.speakerCount.shimon + stats.speakerCount.shirley || 1;
  const pShimon = Math.round((stats.speakerCount.shimon / total) * 100);
  const pShirley = 100 - pShimon;

  ctx.font = '24px NotoHebrew';
  ctx.fillText(`שמעון: ${pShimon}%   |   שירלי: ${pShirley}%`, WIDTH - 30, yStart + barGap * 3 + 20);

  // TOP 5
  ctx.font = '28px NotoHebrew';
  ctx.fillText('המשתמשים המדברים ביותר:', WIDTH - 30, yStart + barGap * 4 + 40);

  ctx.font = '22px NotoHebrew';
  stats.topUsers.forEach((user, i) => {
    const y = yStart + barGap * 5 + i * 30;
    ctx.fillText(`• ${user.name}: ${user.total} תווים`, WIDTH - 30, y);
  });

  // תאריך עדכון
  ctx.font = '18px NotoHebrew';
  ctx.fillStyle = '#888';
  ctx.fillText(`עודכן בתאריך: ${new Date().toLocaleDateString('he-IL')}`, WIDTH - 30, HEIGHT - 20);
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
