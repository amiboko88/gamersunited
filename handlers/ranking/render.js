// 📁 handlers/ranking/render.js
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

const ASSETS_PATH = path.join(__dirname, '../../assets');
const FONT_PATH = path.join(ASSETS_PATH, 'Heebo-Bold.ttf'); // הפונט העברי שלך

// רישום הפונט (חשוב לעברית)
if (fs.existsSync(FONT_PATH)) {
    registerFont(FONT_PATH, { family: 'HebrewFont' });
}

class RankingRenderer {
    
    async generateLeaderboardImage(users, weekNumber) {
        const width = 1000;
        const height = 1200;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 1. רקע "קרבי"
        try {
            const bgPath = path.join(ASSETS_PATH, 'war_bg.jpg'); // או png
            if (fs.existsSync(bgPath)) {
                const bg = await loadImage(bgPath);
                ctx.drawImage(bg, 0, 0, width, height);
            } else {
                // רקע גיבוי גרדיינט
                const grd = ctx.createLinearGradient(0, 0, 0, height);
                grd.addColorStop(0, '#1a2a6c');
                grd.addColorStop(1, '#b21f1f');
                ctx.fillStyle = grd;
                ctx.fillRect(0, 0, width, height);
            }
        } catch (e) {
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, width, height);
        }

        // שכבת כהות לקריאות
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // 2. כותרת
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700'; // זהב
        ctx.font = 'bold 70px "HebrewFont", sans-serif';
        ctx.fillText(`🏆 אלופי השבוע #${weekNumber}`, width / 2, 100);

        ctx.fillStyle = '#fff';
        ctx.font = '30px "HebrewFont", sans-serif';
        ctx.fillText('GAMERS UNITED ISRAEL', width / 2, 150);

        // 3. הצגת המשתמשים
        let yPos = 250;
        
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const isMVP = i === 0;
            
            await this.drawUserRow(ctx, user, i + 1, yPos, isMVP);
            yPos += isMVP ? 180 : 130; // ה-MVP מקבל שורה גדולה יותר
        }

        return canvas.toBuffer();
    }

    async drawUserRow(ctx, user, rank, y, isMVP) {
        const xStart = 50;
        const rowWidth = 900;
        const rowHeight = isMVP ? 150 : 100;
        const radius = 20;

        // רקע לשורה
        ctx.fillStyle = isMVP ? 'rgba(255, 215, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)';
        ctx.strokeStyle = isMVP ? '#FFD700' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = isMVP ? 4 : 1;
        
        ctx.beginPath();
        ctx.roundRect(xStart, y, rowWidth, rowHeight, radius);
        ctx.fill();
        ctx.stroke();

        // מיקום (Rank)
        ctx.fillStyle = isMVP ? '#FFD700' : '#FFF';
        ctx.font = isMVP ? 'bold 60px sans-serif' : 'bold 40px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`#${rank}`, xStart + 30, y + (rowHeight / 2) + 15);

        // תמונת פרופיל (עגולה)
        const avatarSize = isMVP ? 120 : 80;
        const avatarY = y + (rowHeight - avatarSize) / 2;
        const avatarX = xStart + 150;

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        
        try {
            const avatarSrc = user.avatarUrl || path.join(ASSETS_PATH, 'logowa.webp');
            const img = await loadImage(avatarSrc);
            ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
        } catch (e) {
            ctx.fillStyle = '#555';
            ctx.fill();
        }
        ctx.restore();

        // שם + תגית
        ctx.textAlign = 'left';
        ctx.fillStyle = '#FFF';
        ctx.font = isMVP ? 'bold 50px "HebrewFont", sans-serif' : 'bold 35px "HebrewFont", sans-serif';
        let name = user.name;
        if (name.length > 12) name = name.substring(0, 10) + '..';
        ctx.fillText(name, avatarX + avatarSize + 30, y + (rowHeight / 2) + 10);

        // נתונים (ימין)
        ctx.textAlign = 'right';
        const rightEdge = xStart + rowWidth - 30;
        
        ctx.font = '25px "HebrewFont", sans-serif';
        ctx.fillStyle = '#00ffcc'; // צבע הייטק
        ctx.fillText(`🎤 ${user.stats.voiceMinutes} דק'`, rightEdge, y + (rowHeight / 2) - 10);
        
        ctx.fillStyle = '#ffa500'; // כתום
        ctx.fillText(`💬 ${user.stats.messages} הודעות`, rightEdge, y + (rowHeight / 2) + 25);
    }
}

module.exports = new RankingRenderer();