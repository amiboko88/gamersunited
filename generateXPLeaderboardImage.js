// 📁 generateXPLeaderboardImage.js
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");

async function createLeaderboardImage(users) {
  const width = 600;
  const height = 80 + users.length * 70;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // רקע כללי
  ctx.fillStyle = "#1e1e2f";
  ctx.fillRect(0, 0, width, height);

  // כותרת
  ctx.fillStyle = "#ffffff";
  ctx.font = "28px sans-serif";
  ctx.fillText("📈 טבלת מצטייני XP", 30, 50);

  // לכל שורה
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const y = 90 + i * 70;

    // צבע מדליה
    const colors = ["#FFD700", "#C0C0C0", "#CD7F32"]; // זהב, כסף, ארד
    const medalColor = colors[i] || "#999";

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#2a2a40" : "#262636";
    ctx.fillRect(20, y - 30, width - 40, 60);

    // מדליה
    ctx.fillStyle = medalColor;
    ctx.beginPath();
    ctx.arc(50, y, 15, 0, 2 * Math.PI);
    ctx.fill();

    // שם ורמה
    ctx.fillStyle = "#ffffff";
    ctx.font = "22px sans-serif";
    const name = `${u.fullName || u.username || "אנונימי"}`;
    ctx.fillText(`${i + 1}. ${name}`, 80, y - 5);

    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#cccccc";
    ctx.fillText(`רמה ${u.level} – ${u.xp} XP`, 80, y + 20);

    // בר התקדמות
    const nextXP = u.level * 25;
    const percent = Math.min((u.xp / nextXP), 1);
    const barX = 350, barY = y - 15, barW = 200, barH = 20;
    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = "#00bfff";
    ctx.fillRect(barX, barY, barW * percent, barH);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };
