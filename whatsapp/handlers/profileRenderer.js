const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

const ASSETS_PATH = path.join(__dirname, '../../assets');
const TEMP_PATH = path.join(__dirname, '../../temp');

// --- 🛠️ טעינת פונט עברית (חובה!) 🛠️ ---
// וודא שיש לך קובץ בשם 'bold.ttf' בתיקיית assets (למשל Rubik-Bold או Heebo-Bold)
const fontPath = path.join(ASSETS_PATH, 'bold.ttf');
if (fs.existsSync(fontPath)) {
    registerFont(fontPath, { family: 'HebrewFont' });
} else {
    console.warn('⚠️ Font file missing! Hebrew might appear as squares.');
}

if (!fs.existsSync(TEMP_PATH)) fs.mkdirSync(TEMP_PATH, { recursive: true });

const RANKS = [
    { name: 'בוט מתחיל', min: 0, color: '#bdc3c7' },
    { name: 'טירון', min: 50, color: '#cd7f32' },
    { name: 'לוחם', min: 200, color: '#00ffcc' }, // טורקיז בוהק
    { name: 'מתנקש', min: 600, color: '#ffd700' }, // זהב
    { name: 'קומנדו', min: 1200, color: '#ff00ff' }, // מגנטה
    { name: 'אגדה', min: 2500, color: '#ff3333' }  // אדום ניאון
];

function getRank(msgCount) {
    return RANKS.slice().reverse().find(r => msgCount >= r.min) || RANKS[0];
}

// פונקציית עזר לציור מלבן עם פינות עגולות
function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.closePath();
    ctx.fill();
}

async function generateProfileCard(userData) {
    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. רקע
    try {
        let bgPath = path.join(ASSETS_PATH, 'war_bg.jpg');
        if (!fs.existsSync(bgPath)) bgPath = path.join(ASSETS_PATH, 'war_bg.png');
        if (fs.existsSync(bgPath)) {
            const bg = await loadImage(bgPath);
            ctx.drawImage(bg, 0, 0, width, height);
        } else {
            const grd = ctx.createLinearGradient(0, 0, width, height);
            grd.addColorStop(0, '#1a2a6c');
            grd.addColorStop(1, '#b21f1f');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, width, height);
        }
    } catch (e) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
    }

    // 2. שכבת זכוכית כהה (Glassmorphism)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; // רקע כהה חצי שקוף
    drawRoundedRect(ctx, 40, 40, width - 80, height - 80, 25);
    
    // קו מתאר זוהר למסגרת
    ctx.strokeStyle = getRank(userData.messageCount).color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. תמונת פרופיל (מימין הפעם - או משמאל, נשאיר שמאל כדי שהטקסט יהיה מימין לשמאל בצורה יפה)
    const avatarX = 140; 
    const avatarY = height / 2;
    const avatarRadius = 85;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    try {
        const avatarSrc = userData.avatarUrl || path.join(ASSETS_PATH, 'logowa.webp');
        const avatar = await loadImage(avatarSrc);
        ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    } catch (e) {
        ctx.fillStyle = '#333';
        ctx.fill();
    }
    ctx.restore();

    // טבעת זוהרת סביב התמונה
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 5, 0, Math.PI * 2, true);
    ctx.lineWidth = 4;
    ctx.strokeStyle = getRank(userData.messageCount).color;
    ctx.stroke();

    // 4. טקסט ונתונים (RTL - יישור לימין)
    const rightMargin = width - 80; // מתחילים מצד ימין
    ctx.textAlign = 'right'; // טקסט מתיישר לימין

    // שם משתמש
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.font = 'bold 45px "HebrewFont", sans-serif'; 
    ctx.fillStyle = '#ffffff';
    let displayName = userData.name;
    if (displayName.length > 18) displayName = displayName.substring(0, 16) + '..';
    ctx.fillText(displayName, rightMargin, 110);

    // דרגה
    const currentRank = getRank(userData.messageCount);
    ctx.font = '30px "HebrewFont", sans-serif';
    ctx.fillStyle = currentRank.color;
    ctx.fillText(currentRank.name, rightMargin, 155);

    // קו מפריד דק
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(rightMargin - 300, 175, 300, 2);

    // נתונים גדולים
    // XP / הודעות
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px "HebrewFont", sans-serif';
    ctx.fillText(userData.messageCount.toLocaleString(), rightMargin, 240);
    
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '22px "HebrewFont", sans-serif';
    ctx.fillText('הודעות', rightMargin, 270);

    // כסף
    ctx.fillStyle = '#00ffcc'; // צבע כסף ניאון
    ctx.font = 'bold 60px "HebrewFont", sans-serif';
    // הזזת ה-X שמאלה כדי שלא יעלה על ההודעות
    const moneyX = rightMargin - 200; 
    ctx.fillText(`₪${userData.balance.toLocaleString()}`, moneyX, 240);
    
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '22px "HebrewFont", sans-serif';
    ctx.fillText('ארנק', moneyX, 270);

    // 5. XP Bar למטה
    const nextRankIndex = RANKS.indexOf(currentRank) + 1;
    const nextRank = RANKS[nextRankIndex] || { min: userData.messageCount * 1.5 }; 
    const range = nextRank.min - currentRank.min;
    const progress = userData.messageCount - currentRank.min;
    let percentage = range === 0 ? 1 : (progress / range);
    if (percentage > 1) percentage = 1;

    const barX = 260; // מתחיל אחרי התמונה
    const barY = 320;
    const barWidth = 460;
    const barHeight = 15;

    // רקע הבר
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    drawRoundedRect(ctx, barX, barY, barWidth, barHeight, 8);

    // מילוי הבר
    ctx.fillStyle = currentRank.color;
    drawRoundedRect(ctx, barX, barY, barWidth * percentage, barHeight, 8);

    // טקסט התקדמות
    ctx.font = '16px "HebrewFont", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(`XP ${userData.messageCount} / ${nextRank.min}`, barX + (barWidth / 2), barY + 35);

    const buffer = canvas.toBuffer('image/png');
    const outputPath = path.join(TEMP_PATH, `profile_${Date.now()}.png`);
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
}

module.exports = { generateProfileCard };