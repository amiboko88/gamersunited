const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// הגדרת נתיבים
const ASSETS_PATH = path.join(__dirname, '../../assets');
const TEMP_PATH = path.join(__dirname, '../../temp');

// וודא שתיקיית temp קיימת
if (!fs.existsSync(TEMP_PATH)) fs.mkdirSync(TEMP_PATH, { recursive: true });

// הגדרת דרגות לפי כמות הודעות
const RANKS = [
    { name: 'בוט מתחיל', min: 0, color: '#bdc3c7' },       // אפור
    { name: 'טירון', min: 50, color: '#cd7f32' },          // ברונזה
    { name: 'לוחם', min: 200, color: '#c0c0c0' },          // כסף
    { name: 'מתנקש', min: 600, color: '#ffd700' },         // זהב
    { name: 'קומנדו', min: 1200, color: '#00ffff' },       // טורקיז
    { name: 'אגדה', min: 2500, color: '#ff00ff' },         // סגול ניאון
    { name: 'Shimon Partner', min: 5000, color: '#e74c3c' } // אדום
];

function getRank(msgCount) {
    // מוצא את הדרגה הגבוהה ביותר שהמשתמש עבר את ה-min שלה
    return RANKS.slice().reverse().find(r => msgCount >= r.min) || RANKS[0];
}

// פונקציית עזר לציור מלבן מעוגל (אם לא קיים בסביבה)
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

async function generateProfileCard(userData) {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. טעינת רקע (war_bg.jpg)
    try {
        let bgPath = path.join(ASSETS_PATH, 'war_bg.jpg');
        if (!fs.existsSync(bgPath)) bgPath = path.join(ASSETS_PATH, 'war_bg.png');

        if (fs.existsSync(bgPath)) {
            const bg = await loadImage(bgPath);
            ctx.drawImage(bg, 0, 0, width, height);
        } else {
            // גיבוי: גרדיאנט כהה
            const grd = ctx.createLinearGradient(0, 0, width, height);
            grd.addColorStop(0, '#0f0c29');
            grd.addColorStop(1, '#302b63');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, width, height);
        }
    } catch (e) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, width, height);
    }

    // 2. שכבת כהות מעוגלת (Overlay)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // שחור חצי שקוף
    drawRoundedRect(ctx, 30, 30, width - 60, height - 60, 30); // מסגרת מעוגלת גדולה

    // 3. תמונת פרופיל (עיגול)
    const avatarX = 150;
    const avatarY = height / 2;
    const avatarRadius = 85;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();

    try {
        // משתמש בתמונת ברירת מחדל (logowa.webp) אם אין URL
        const avatarSrc = userData.avatarUrl || path.join(ASSETS_PATH, 'logowa.webp');
        const avatar = await loadImage(avatarSrc);
        ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    } catch (e) {
        // אם גם לוגו ברירת המחדל נכשל - צבע אפור
        ctx.fillStyle = '#555';
        ctx.fill();
    }
    ctx.restore();

    // מסגרת זוהרת לאווטאר
    const currentRank = getRank(userData.messageCount);
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2, true);
    ctx.lineWidth = 6;
    ctx.strokeStyle = currentRank.color; // צבע המסגרת לפי הדרגה
    ctx.stroke();

    // 4. טקסטים
    const textStartX = 280;
    ctx.textAlign = 'left';

    // שם המשתמש (מוקטן לתמיכה בעברית ארוכה)
    ctx.font = 'bold 35px sans-serif'; 
    ctx.fillStyle = '#ffffff';
    // חותך שם ארוך מידי (20 תווים במקום 15)
    let displayName = userData.name;
    if (displayName.length > 20) displayName = displayName.substring(0, 18) + '..';
    ctx.fillText(displayName, textStartX, 120);

    // דרגה
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = currentRank.color;
    ctx.fillText(`${currentRank.name.toUpperCase()}`, textStartX, 165);

    // נתונים (כסף והודעות)
    ctx.fillStyle = '#dddddd';
    ctx.font = '24px sans-serif';
    ctx.fillText(`💳 ארנק: ₪${userData.balance.toLocaleString()}`, textStartX, 220);
    ctx.fillText(`💬 הודעות: ${userData.messageCount.toLocaleString()}`, textStartX, 260);

    // 5. מד התקדמות (XP Bar)
    const nextRankIndex = RANKS.indexOf(currentRank) + 1;
    const nextRank = RANKS[nextRankIndex] || { min: userData.messageCount * 1.5 }; 
    
    const prevRankMin = currentRank.min;
    const range = nextRank.min - prevRankMin;
    const progress = userData.messageCount - prevRankMin;
    let percentage = range === 0 ? 1 : (progress / range);
    if (percentage > 1) percentage = 1;
    if (percentage < 0.02) percentage = 0.02; 

    // ציור הבר
    const barX = textStartX;
    const barY = 300;
    const barWidth = 450;
    const barHeight = 25;

    // רקע הבר (מעוגל)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    drawRoundedRect(ctx, barX, barY, barWidth, barHeight, 10);

    // מילוי הבר (מעוגל)
    ctx.save();
    drawRoundedRect(ctx, barX, barY, barWidth * percentage, barHeight, 10);
    ctx.clip();
    ctx.fillStyle = currentRank.color;
    ctx.fillRect(barX, barY, barWidth * percentage, barHeight);
    ctx.restore();

    // טקסט קטן מעל הבר
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${userData.messageCount} / ${nextRank.min} XP`, barX + barWidth, barY - 8);

    // שמירה לקובץ
    const outputPath = path.join(TEMP_PATH, `profile_${Date.now()}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
}

module.exports = { generateProfileCard };