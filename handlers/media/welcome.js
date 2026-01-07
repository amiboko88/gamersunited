// 📁 handlers/media/welcome.js
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// נתיבים לנכסים
const ASSETS_PATH = path.join(__dirname, '../../assets');
const FONT_PATH = path.join(ASSETS_PATH, 'NotoSansHebrew-Bold.ttf');

// רישום פונט (אם קיים)
if (fs.existsSync(FONT_PATH)) {
    registerFont(FONT_PATH, { family: 'Noto Sans Hebrew' });
}

async function generateWelcomeImage(member) {
    const width = 1000;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. רקע גרדיאנט יוקרתי (תואם ל-OnlyG)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#181818");
    gradient.addColorStop(0.5, "#33281b");
    gradient.addColorStop(1, "#e8c45a"); // זהב
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 2. תמונת פרופיל (עיגול)
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    try {
        const avatar = await loadImage(avatarURL);
        const avatarSize = 180;
        const avatarX = width / 2 - avatarSize / 2;
        const avatarY = 40;

        ctx.save();
        ctx.beginPath();
        ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
        
        // טבעת זהב מסביב
        ctx.beginPath();
        ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#e8c45a';
        ctx.stroke();
    } catch (e) { console.error('Error loading avatar:', e); }

    // 3. טקסטים
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    
    // "ברוך הבא"
    ctx.font = 'bold 50px "Noto Sans Hebrew", sans-serif';
    ctx.fillText(`ברוך הבא, ${member.displayName}!`, width / 2, 290);

    // "משתמש מספר X"
    ctx.font = '30px "Noto Sans Hebrew", sans-serif';
    ctx.fillStyle = '#FFE98B';
    ctx.fillText(`משתמש מספר #${member.guild.memberCount}`, width / 2, 340);

    return canvas.toBuffer();
}

module.exports = { generateWelcomeImage };