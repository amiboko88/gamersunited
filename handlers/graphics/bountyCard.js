const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const { log } = require('../../utils/logger');

// נסה לטעון פונט אם קיים, אחרת יסתמך על ברירת מחדל
try {
    // registerFont(path.join(__dirname, '../../assets/fonts/Western.ttf'), { family: 'Western' });
} catch (e) {
    // Font optional
}

class BountyCardGenerator {

    /**
     * יוצר תמונת WANTED למשתמש
     * @param {string} username שם המשתמש
     * @param {string} avatarUrl כתובת האווטאר (חייבת להיות נגישה)
     * @param {number} reward סכום הפרס
     * @returns {Promise<Buffer>} ה-Buffer של התמונה
     */
    async generateCard(username, avatarUrl, reward = 1000) {
        try {
            const width = 800;
            const height = 1000;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // 1. רקע כהה מודרני (Dark Mode Gradient)
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, '#0f0c29');
            gradient.addColorStop(0.5, '#302b63');
            gradient.addColorStop(1, '#24243e');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            // 2. רשת טכנולוגית ברקע (Grid)
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            for (let i = 0; i < width; i += 40) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
            }
            for (let i = 0; i < height; i += 40) {
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
            }

            // 3. מסגרת ניאון (Cyber Border)
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ff0055'; // Pink Neon
            ctx.strokeStyle = '#ff0055';
            ctx.lineWidth = 10;
            ctx.strokeRect(40, 40, width - 80, height - 80);
            ctx.shadowBlur = 0; // Reset Shadow

            // 4. כותרת WANTED (Glitch Effect)
            ctx.textAlign = 'center';
            ctx.font = 'bold 110px "Arial", sans-serif'; // Fallback to standard font

            // Glitch Layer 1 (Red)
            ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            ctx.fillText('WANTED', width / 2 - 5, 175);

            // Glitch Layer 2 (Cyan)
            ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
            ctx.fillText('WANTED', width / 2 + 5, 185);

            // Main Layer (White)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('WANTED', width / 2, 180);

            ctx.font = '30px "Courier New", sans-serif';
            ctx.fillStyle = '#00ffcc'; // Cyber Green
            ctx.fillText('/// GHOST DETECTED ///', width / 2, 230);

            // 5. תמונת הפרופיל (Circle with Glow)
            const avatarSize = 350;
            const avatarX = (width - avatarSize) / 2;
            const avatarY = 280;

            ctx.save();
            ctx.beginPath();
            ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();

            try {
                const avatar = await loadImage(avatarUrl || 'https://i.imgur.com/XF8h7gV.png');
                ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
            } catch (imgError) {
                ctx.fillStyle = '#000';
                ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
            }
            ctx.restore();

            // טבעת ניאון סביב התמונה
            ctx.shadowBlur = 35;
            ctx.shadowColor = '#00ffcc';
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // 6. פרטים
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 70px "Arial", sans-serif';
            ctx.fillText(username.toUpperCase(), width / 2, 750);

            // סטטוס
            ctx.fillStyle = '#ff0055'; // Pink
            ctx.font = 'bold 40px "Courier New", sans-serif';
            ctx.fillText('[ STATUS: DISCONNECTED ]', width / 2, 810);

            // 7. פרס (Digital Box)
            const boxY = 880;
            const boxH = 100;
            const boxW = 500;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect((width - boxW) / 2, boxY, boxW, boxH);

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect((width - boxW) / 2, boxY, boxW, boxH);

            ctx.fillStyle = '#00ff00'; // Matrix Green
            ctx.font = 'bold 80px "Courier New", sans-serif';
            ctx.fillText(`₪${reward}`, width / 2, boxY + 75);

            return canvas.toBuffer();

        } catch (error) {
            log(`❌ [Graphics] Bounty Gen Error: ${error.message}`);
            return null;
        }
    }

    addNoise(ctx, w, h) {
        for (let i = 0; i < 500; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.1})`;
            ctx.fillRect(x, y, Math.random() * 3, Math.random() * 3);
        }
    }
}

module.exports = new BountyCardGenerator();
