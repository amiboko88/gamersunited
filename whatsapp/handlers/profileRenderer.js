const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // חובה לטובת הורדת הפונט

const ASSETS_PATH = path.join(__dirname, '../../assets');
const TEMP_PATH = path.join(__dirname, '../../temp');
const FONT_PATH = path.join(ASSETS_PATH, 'Heebo-Bold.ttf');
// קישור לפונט Heebo Bold (פונט מודרני שתומך בעברית מצוין)
const FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/heebo/Heebo-Bold.ttf';

if (!fs.existsSync(TEMP_PATH)) fs.mkdirSync(TEMP_PATH, { recursive: true });
if (!fs.existsSync(ASSETS_PATH)) fs.mkdirSync(ASSETS_PATH, { recursive: true });

// --- פונקציה להורדת הפונט אם חסר ---
async function ensureFontExists() {
    if (fs.existsSync(FONT_PATH)) return true;

    console.log("⚠️ Font missing! Downloading Heebo-Bold for Hebrew support...");
    try {
        const response = await axios({
            url: FONT_URL,
            method: 'GET',
            responseType: 'arraybuffer'
        });
        fs.writeFileSync(FONT_PATH, response.data);
        console.log("✅ Font downloaded successfully to:", FONT_PATH);
        return true;
    } catch (error) {
        console.error("❌ Failed to download font:", error.message);
        return false;
    }
}

// ניסיון ראשוני לרישום הפונט (אם כבר קיים)
if (fs.existsSync(FONT_PATH)) {
    registerFont(FONT_PATH, { family: 'HebrewFont' });
}

const RANKS = [
    { name: 'בוט מתחיל', min: 0, color: '#bdc3c7' },
    { name: 'טירון', min: 50, color: '#cd7f32' },
    { name: 'לוחם', min: 200, color: '#00ffcc' },
    { name: 'מתנקש', min: 600, color: '#ffd700' },
    { name: 'קומנדו', min: 1200, color: '#ff00ff' },
    { name: 'אגדה', min: 2500, color: '#ff3333' }
];

function getRank(msgCount) {
    return RANKS.slice().reverse().find(r => msgCount >= r.min) || RANKS[0];
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.closePath();
    ctx.fill();
}

async function generateProfileCard(userData) {
    // ✅ שלב 1: וידוא שיש פונט בעברית
    await ensureFontExists();
    // רישום מחדש למקרה שהורדנו הרגע
    if (fs.existsSync(FONT_PATH)) {
        registerFont(FONT_PATH, { family: 'HebrewFont' });
    }

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
            grd.addColorStop(0, '#141E30');
            grd.addColorStop(1, '#243B55');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, width, height);
        }
    } catch (e) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
    }

    // 2. מסגרת זכוכית מעוגלת
    ctx.save();
    ctx.globalAlpha = 0.85; 
    ctx.fillStyle = '#000000'; 
    drawRoundedRect(ctx, 20, 20, width - 40, height - 40, 30);
    ctx.restore();

    const currentRank = getRank(userData.messageCount);
    ctx.strokeStyle = currentRank.color;
    ctx.lineWidth = 3;
    ctx.stroke(); 

    // 3. תמונת פרופיל
    const avatarX = 130; 
    const avatarY = height / 2;
    const avatarRadius = 90;

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

    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 5, 0, Math.PI * 2, true);
    ctx.lineWidth = 5;
    ctx.strokeStyle = currentRank.color;
    ctx.stroke();

    // 4. טקסטים (RTL)
    const rightMargin = width - 60; 
    ctx.textAlign = 'right';

    // שם המשתמש
    // משתמשים ב-HebrewFont שהורדנו, עם גיבוי ל-sans-serif
    ctx.font = 'bold 40px "HebrewFont", sans-serif'; 
    ctx.fillStyle = '#ffffff';
    let displayName = userData.name;
    if (displayName.length > 18) displayName = displayName.substring(0, 16) + '..';
    ctx.fillText(displayName, rightMargin, 100);

    // דרגה
    ctx.font = '30px "HebrewFont", sans-serif'; 
    ctx.fillStyle = currentRank.color;
    ctx.fillText(currentRank.name, rightMargin, 145);

    // קו מפריד
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(280, 165, 460, 2);

    // נתונים גדולים
    // XP / הודעות
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 55px "HebrewFont", sans-serif'; 
    ctx.fillText(userData.messageCount.toLocaleString(), rightMargin, 230);
    
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '22px "HebrewFont", sans-serif'; 
    ctx.fillText('הודעות', rightMargin, 260);

    // ארנק
    const moneyX = rightMargin - 220; 
    ctx.fillStyle = '#00ffcc'; 
    ctx.font = 'bold 55px "HebrewFont", sans-serif'; 
    ctx.fillText(`₪${userData.balance.toLocaleString()}`, moneyX, 230);
    
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '22px "HebrewFont", sans-serif'; 
    ctx.fillText('ארנק', moneyX, 260);

    // 5. XP Bar
    const nextRankIndex = RANKS.indexOf(currentRank) + 1;
    const nextRank = RANKS[nextRankIndex] || { min: userData.messageCount * 1.5 }; 
    const range = nextRank.min - currentRank.min;
    const progress = userData.messageCount - currentRank.min;
    let percentage = range === 0 ? 1 : (progress / range);
    if (percentage > 1) percentage = 1;
    if (percentage < 0.05) percentage = 0.05; 

    const barX = 280; 
    const barY = 320;
    const barWidth = 460;
    const barHeight = 18;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    drawRoundedRect(ctx, barX, barY, barWidth, barHeight, 10);

    ctx.fillStyle = currentRank.color;
    drawRoundedRect(ctx, barX, barY, barWidth * percentage, barHeight, 10);

    ctx.fillStyle = '#888';
    ctx.font = '16px "HebrewFont", sans-serif'; 
    ctx.textAlign = 'center';
    ctx.fillText(`${userData.messageCount} / ${nextRank.min} XP`, barX + (barWidth / 2), barY + 40);

    const buffer = canvas.toBuffer('image/png');
    const outputPath = path.join(TEMP_PATH, `profile_${Date.now()}.png`);
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
}

module.exports = { generateProfileCard };