const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const axios = require("axios");

registerFont(path.join(__dirname, "../assets/NotoSansHebrew-Bold.ttf"), {
  family: "NotoHebrew"
});
registerFont(path.join(__dirname, "../assets/Symbola.ttf"), {
  family: "EmojiFont"
});

async function generateXPProfileCard({ fullName, level, xp, avatarURL }) {
  const width = 700;
  const height = 280;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const nextXP = level * 25;
  const percent = Math.min((xp / nextXP) * 100, 100);

  // 🖼️ רקע
  const bg = await loadImage(path.join(__dirname, "../assets/war_bg.png"));
  ctx.drawImage(bg, 0, 0, width, height);

  // 🧑‍🎤 תמונת פרופיל
  try {
    if (!avatarURL?.startsWith("http")) throw new Error("avatarURL לא תקף");
    const response = await axios.get(avatarURL, { responseType: "arraybuffer" });
    const avatarImg = await loadImage(response.data);
    ctx.save();
    ctx.beginPath();
    ctx.arc(110, 140, 60, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, 50, 80, 120, 120);
    ctx.restore();
  } catch (e) {
    console.warn("⚠️ לא נטענה תמונת פרופיל:", e.message);
  }

  // 🟩 בר התקדמות
  const barX = 200, barY = 170, barW = 460, barH = 25;
  const fillW = Math.round((percent / 100) * barW);

  ctx.fillStyle = "#444";
  ctx.fillRect(barX, barY, barW, barH);

  ctx.fillStyle = percent >= 90 ? "#00e676" : percent >= 50 ? "#f9a825" : "#e53935";
  ctx.fillRect(barX, barY, fillW, barH);

  // 📝 טקסטים
  ctx.fillStyle = "#fff";
  ctx.textAlign = "right";

  ctx.font = "24px EmojiFont";
  ctx.fillText(`‏${fullName}`, width - 40, 70);

  ctx.font = "20px NotoHebrew";
  ctx.fillText(`‏XP: ${xp}/${nextXP} · רמה ${level}`, width - 40, 120);

  ctx.font = "18px NotoHebrew";
  ctx.fillText(`‏התקדמות: ${Math.floor(percent)}%`, width - 40, 205);

  return canvas.toBuffer("image/png");
}

module.exports = { generateXPProfileCard };
