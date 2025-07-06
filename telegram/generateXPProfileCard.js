const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const axios = require("axios");

// 🔤 גופנים
registerFont(path.join(__dirname, "../assets/NotoSansHebrew-Bold.ttf"), {
  family: "NotoHebrew"
});
registerFont(path.join(__dirname, "../assets/Symbola.ttf"), {
  family: "EmojiFont"
});

async function generateXPProfileCard({ fullName, level, xp, avatarURL }) {
  const nextXP = level * 25;
  const percent = Math.min((xp / nextXP) * 100, 100);
  const width = 700;
  const height = 280;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 🖼️ רקע
  const bgPath = path.join(__dirname, "../assets", "war_bg.png");
  const background = await loadImage(bgPath);
  ctx.drawImage(background, 0, 0, width, height);

  // 🧑‍🎤 תמונת פרופיל עגולה
  try {
    const response = await axios.get(avatarURL, { responseType: "arraybuffer" });
    const avatarImg = await loadImage(response.data);
    ctx.save();
    ctx.beginPath();
    ctx.arc(110, 140, 60, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, 50, 80, 120, 120);
    ctx.restore();
  } catch (err) {
    console.warn("⚠️ לא נטענה תמונת פרופיל:", err.message);
  }

  // 🟩 בר התקדמות
  const barX = 200, barY = 170, barWidth = 460, barHeight = 25;
  const fillWidth = Math.round((percent / 100) * barWidth);

  ctx.fillStyle = "#444";
  ctx.fillRect(barX, barY, barWidth, barHeight);

  ctx.fillStyle = percent >= 90 ? "#00e676" : percent >= 50 ? "#f9a825" : "#e53935";
  ctx.fillRect(barX, barY, fillWidth, barHeight);

  // ✍️ טקסטים
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";

  ctx.font = "24px EmojiFont";
  ctx.fillText(`‏${fullName}`, width - 40, 70);

  ctx.font = "20px NotoHebrew";
  ctx.fillText(`‏XP: ${xp}/${nextXP} · רמה ${level}`, width - 40, 120);

  ctx.font = "18px NotoHebrew";
  ctx.fillText(`‏התקדמות: ${Math.floor(percent)}%`, width - 40, 205);

  // 🟢 החזרה בדיוק כמו בטבלת TOP — buffer בלבד
  return canvas.toBuffer("image/png");
}

module.exports = { generateXPProfileCard };
