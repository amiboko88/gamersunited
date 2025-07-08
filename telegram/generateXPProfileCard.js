const { createCanvas, registerFont, loadImage } = require("canvas");
const path = require("path");

// 🟢 פונטים
registerFont(path.join(__dirname, "../assets/NotoSansHebrew-Bold.ttf"), {
  family: "HebrewBold"
});
registerFont(path.join(__dirname, "../assets/Symbola.ttf"), {
  family: "EmojiFont"
});

function getBarColor(percent) {
  if (percent < 0.4) return "#e74c3c";
  if (percent < 0.7) return "#f9a825";
  return "#00e676";
}

async function generateXPProfileCard({ fullName, level, xp, avatarBuffer }) {
  const width = 900;
  const height = 300;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 🔳 רקע
  ctx.fillStyle = "#151621";
  ctx.fillRect(0, 0, width, height);

  // 🧬 כותרת
  ctx.font = "42px EmojiFont";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("🧬", width - 60, 70);

  ctx.font = "bold 36px HebrewBold";
  ctx.fillText("\u200Fהפרופיל שלך", width - 110, 70);

  // 🧑‍🎤 אוואטר אם סופק
  if (avatarBuffer && Buffer.isBuffer(avatarBuffer)) {
    try {
      const avatarImg = await loadImage(avatarBuffer);
      ctx.save();
      ctx.beginPath();
      ctx.arc(130, 130, 60, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, 70, 70, 120, 120);
      ctx.restore();
    } catch (err) {
      console.warn("⚠️ שגיאה בטעינת אוואטר:", err.message);
    }
  }

  const nextXP = level * 25;
  const percent = Math.min(xp / nextXP, 1);
  const percentText = `${Math.round(percent * 100)}%`;
  const barColor = getBarColor(percent);

  // 🟩 בר התקדמות
  const barX = 240;
  const barY = 140;
  const barW = 400;
  const barH = 40;
  const fillW = Math.floor(barW * percent);

  ctx.fillStyle = "#444";
  ctx.fillRect(barX, barY, barW, barH);

  ctx.fillStyle = barColor;
  ctx.fillRect(barX, barY, fillW, barH);

  ctx.font = "bold 16px HebrewBold";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(percentText, barX + barW / 2, barY + 26);

  // 📝 טקסטים
  ctx.textAlign = "right";
  ctx.font = "bold 24px HebrewBold";
  ctx.fillText(`‏${fullName}`, width - 60, 110);

  ctx.font = "20px HebrewBold";
  ctx.fillText(`‏XP: ${xp}/${nextXP} · רמה ${level}`, width - 60, 180);

  ctx.font = "18px HebrewBold";
  ctx.fillText(`‏התקדמות כוללת: ${Math.round(percent * 100)}%`, width - 60, 220);

  return canvas.toBuffer("image/png");
}

module.exports = { generateXPProfileCard };
