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

function drawProgressBarRTL(ctx, x, y, width, height, percent, label) {
  ctx.fillStyle = '#444';
  ctx.fillRect(x, y, width, height);

  const barWidth = Math.min(percent, 1) * width;
  ctx.fillStyle = getColor(percent);
  ctx.fillRect(x + width - barWidth, y, barWidth, height);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText(`${(percent * 100).toFixed(1)}% – ${label}`, x + width - 10, y + height - 7);
}

function draw(ctx, stats) {
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.direction = 'rtl';
  ctx.font = '24px NotoHebrew';
  ctx.fillStyle = '#ffffff';

  ctx.fillText('סטטוס השימוש בקול של שמעון', WIDTH - 30, 40);

  // bars
  drawProgressBarRTL(ctx, WIDTH - 620, 70, 550, 28, (stats.usage[new Date().toISOString().split('T')[0]] || 0) / 15000, 'תווים יומיים');
  drawProgressBarRTL(ctx, WIDTH - 620, 115, 550, 28, Object.values(stats.usage).reduce((a, b) => a + b, 0) / 500000, 'תווים חודשיים');
  drawProgressBarRTL(ctx, WIDTH - 620, 160, 550, 28, Object.keys(stats.usage).length / 30, 'קריאות יומיות');

  // speaker ratio
  const total = stats.speakerCount.shimon + stats.speakerCount.shirley || 1;
  const pShimon = Math.round((stats.speakerCount.shimon / total) * 100);
  const pShirley = 100 - pShimon;

  ctx.fillText(`שמעון: ${pShimon}%  |  שירלי: ${pShirley}%`, WIDTH - 30, 210);

  // top users
  ctx.fillText('המשתמשים המדברים ביותר:', WIDTH - 30, 265);
  stats.topUsers.forEach((user, i) => {
    const y = 300 + i * 30;
    ctx.fillText(`• ${user.name}: ${user.total} תווים`, WIDTH - 30, y);
  });

  // תאריך עדכון
  ctx.font = '18px NotoHebrew';
  ctx.fillStyle = '#aaaaaa';
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
