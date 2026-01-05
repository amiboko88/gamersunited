// 📁 utils/ttsStatsImage.js
const { createCanvas, registerFont } = require('canvas');
const admin = require('firebase-admin');
const path = require('path');

// טעינת פונט עברי
registerFont(path.join(__dirname, '../assets/NotoSansHebrew-Bold.ttf'), {
  family: 'NotoHebrew'
});

const WIDTH = 900;
const HEIGHT = 500;

// מיפוי קולות לדמויות
const VOICE_MAP = {
    'ash': 'shimon', 'onyx': 'shimon', 'echo': 'shimon',
    'coral': 'shirley', 'nova': 'shirley', 'shimmer': 'shirley',
    'alloy': 'narrator', 'fable': 'narrator'
};

function getColor(percent) {
  if (percent >= 1) return '#ff3333';
  if (percent >= 0.9) return '#ffaa00';
  return '#00cc66';
}

async function getStatsData() {
  const db = admin.firestore();
  const usage = {};
  const speakerCount = { shimon: 0, shirley: 0, narrator: 0 };
  const userTotals = {};

  // קריאה מהקולקשן החדש והנכון
  const auditSnap = await db.collection('openAiTtsUsage')
    .where('timestamp', '>=', new Date(Date.now() - 7 * 86400000)) // שבוע אחרון
    .get();

  auditSnap.forEach(doc => {
    const { timestamp, voiceProfile, characterCount, userId } = doc.data();
    
    // המרת Timestamp לתאריך מחרוזת
    const dateObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const date = dateObj.toISOString().split('T')[0];

    // ספירת תווים יומית
    usage[date] = (usage[date] || 0) + (characterCount || 0);

    // זיהוי דמות לפי קול
    const character = VOICE_MAP[voiceProfile] || 'narrator';
    speakerCount[character] = (speakerCount[character] || 0) + (characterCount || 0);

    // ספירה למשתמש
    if (userId) {
        userTotals[userId] = (userTotals[userId] || 0) + (characterCount || 0);
    }
  });

  return { usage, speakerCount, userTotals };
}

function drawBar(ctx, x, y, width, height, percent, label) {
  const fillHeight = Math.min(height * percent, height);
  ctx.fillStyle = '#444';
  ctx.fillRect(x, y, width, height); // רקע הבר
  
  ctx.fillStyle = getColor(percent);
  ctx.fillRect(x, y + height - fillHeight, width, fillHeight); // המילוי

  ctx.fillStyle = '#fff';
  ctx.font = '16px NotoHebrew';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + width / 2, y + height + 20);
  ctx.fillText(`${Math.round(percent * 100)}%`, x + width / 2, y - 10);
}

module.exports = async () => {
  const stats = await getStatsData();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // רקע
  ctx.fillStyle = '#2c2f33';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // כותרת
  ctx.fillStyle = '#ffffff';
  ctx.font = '36px NotoHebrew';
  ctx.textAlign = 'right';
  ctx.fillText('דוח שימוש במנוע הדיבור (שבוע אחרון)', WIDTH - 30, 50);

  // נתונים כלליים בצד שמאל
  const totalChars = Object.values(stats.usage).reduce((a, b) => a + b, 0);
  
  ctx.font = '24px NotoHebrew';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText(`סה"כ תווים: ${totalChars.toLocaleString()}`, 30, 50);

  // גרפים (Visual Bars) - דוגמה פשוטה
  const usageValues = Object.values(stats.usage);
  const maxUsage = Math.max(...usageValues, 1000); // נרמול
  const days = Object.keys(stats.usage).sort();

  const barWidth = 60;
  const gap = 30;
  const startX = 50;
  const graphBottom = 400;
  const graphHeight = 250;

  days.slice(-7).forEach((day, i) => {
      const val = stats.usage[day] || 0;
      const percent = val / maxUsage;
      const x = startX + i * (barWidth + gap);
      
      drawBar(ctx, x, graphBottom - graphHeight, barWidth, graphHeight, percent, day.slice(5)); // מציג רק MM-DD
  });

  // פילוח דמויות (עיגול או טקסט)
  const totalVoice = stats.speakerCount.shimon + stats.speakerCount.shirley + stats.speakerCount.narrator || 1;
  const pShimon = Math.round((stats.speakerCount.shimon / totalVoice) * 100);
  const pShirley = Math.round((stats.speakerCount.shirley / totalVoice) * 100);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText(`שמעון: ${pShimon}%  |  שירלי: ${pShirley}%`, WIDTH - 30, 100);

  return canvas.toBuffer();
};