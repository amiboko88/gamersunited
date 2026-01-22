const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// Register fonts (Ensure these exist or use system fonts)
try {
    registerFont(path.join(__dirname, '../../assets/fonts/Heebo-Bold.ttf'), { family: 'Heebo' });
} catch (e) { }

async function generateMatchCard(matches, summary) {
    const width = 800;
    const rowHeight = 60;
    const headerHeight = 100;
    const footerHeight = 60;
    const height = headerHeight + (matches.length * rowHeight) + footerHeight;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // --- Background ---
    ctx.fillStyle = '#1a1a1a'; // Dark Gray
    ctx.fillRect(0, 0, width, height);

    // Dynamic Gradient Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#0f0c29');
    gradient.addColorStop(0.5, '#302b63');
    gradient.addColorStop(1, '#24243e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // --- Header ---
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px "Heebo", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("WARZONE MATCH REPORT", width / 2, 50);

    ctx.font = '18px "Heebo", sans-serif';
    ctx.fillStyle = '#cccccc';
    ctx.fillText(new Date().toLocaleString('he-IL'), width / 2, 80);

    // --- Table Headers ---
    const headers = ['NAME', 'KILLS', 'DAMAGE', 'SCORE', 'NOTE'];
    const colX = [50, 250, 400, 550, 700];

    ctx.font = 'bold 20px "Heebo", sans-serif';
    ctx.fillStyle = '#fbbf24'; // Gold
    ctx.textAlign = 'left';
    headers.forEach((h, i) => ctx.fillText(h, colX[i], headerHeight - 15));

    // Separator Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, headerHeight - 5);
    ctx.lineTo(width - 30, headerHeight - 5);
    ctx.stroke();

    // --- Rows ---
    matches.sort((a, b) => b.damage - a.damage); // Sort by Damage

    matches.forEach((p, i) => {
        const y = headerHeight + 35 + (i * rowHeight);

        // Row Background (Alternating)
        if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(30, y - 40, width - 60, rowHeight);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '24px "Heebo", sans-serif';
        ctx.textAlign = 'left';

        // 1. Name
        ctx.fillText(p.username.substring(0, 12), colX[0], y);

        // 2. Kills
        ctx.fillStyle = '#4ade80'; // Green
        ctx.fillText(p.kills.toString(), colX[1], y);

        // 3. Damage
        ctx.fillStyle = '#f87171'; // Red
        ctx.fillText(p.damage.toString(), colX[2], y);

        // 4. Score (Calculated or N/A)
        const score = p.score || (p.kills * 100 + Math.floor(p.damage / 10));
        ctx.fillStyle = '#60a5fa'; // Blue
        ctx.fillText(score.toString(), colX[3], y);

        // 5. Note (Calculated K/D Vibe)
        let note = "😐";
        if (p.kills > 10) note = "🔥 Killer";
        if (p.damage > 4000 && p.kills < 5) note = "🐢 Assist";
        if (p.kills > 15 && p.damage < 3000) note = "🐀 Steal";

        ctx.font = '20px "Heebo", sans-serif';
        ctx.fillText(note, colX[4], y);
    });

    // --- Footer ---
    ctx.font = 'italic 16px "Heebo", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText("Analyzed by Shimon AI | Gamers United", width / 2, height - 20);

    return canvas.toBuffer('image/png');
}

module.exports = { generateMatchCard };
