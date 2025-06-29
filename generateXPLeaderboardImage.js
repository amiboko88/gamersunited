const { createCanvas, registerFont, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");

registerFont(path.join(__dirname, "assets", "NotoSansHebrew-Bold.ttf"), {
  family: "Noto"
});

function drawTextWithShadow(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#00000080";
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

async function createLeaderboardImage(users) {
  const width = 800;
  const rowHeight = 90;
  const headerHeight = 100;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // רקע
  ctx.fillStyle = "#1c1b29";
  ctx.fillRect(0, 0, width, height);

  drawTextWithShadow(ctx, "📈 טבלת מצטייני XP", width / 2, 55, "bold 34px 'Noto'", "center");

  ctx.strokeStyle = "#ffffff33";
  ctx.beginPath();
  ctx.moveTo(60, 70);
  ctx.lineTo(width - 60, 70);
  ctx.stroke();

  // נסה לטעון מדליות
  let medalImgs = [null, null, null];
  const medals = ["gold", "silver", "bronze"];
  for (let i = 0; i < 3; i++) {
    const file = path.join(__dirname, "assets", `${medals[i]}_medal.png`);
    if (fs.existsSync(file)) {
      medalImgs[i] = await loadImage(file);
    }
  }

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const yTop = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const barFill = Math.floor(percent * 220);

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#262638" : "#2e2e45";
    ctx.fillRect(30, yTop, width - 60, rowHeight - 10);

    // מדליה / Emoji
    if (i < 3) {
      if (medalImgs[i]) {
        ctx.drawImage(medalImgs[i], width - 50, yTop + 20, 28, 28);
      } else {
        const emoji = ["🥇", "🥈", "🥉"][i];
        drawTextWithShadow(ctx, emoji, width - 45, yTop + 42, "26px 'Noto'");
      }
    }

    // שם
    const name = `${u.fullName || u.username || "אנונימי"}`;
    drawTextWithShadow(ctx, `🧠 ${name}`, width - 90, yTop + 35, "bold 24px 'Noto'");

    // רמה ו־XP
    drawTextWithShadow(
      ctx,
      `🏅 רמה ${level} – ${xp} XP`,
      width - 90,
      yTop + 60,
      "18px 'Noto'"
    );

    // בר התקדמות
    const barX = 60;
    const barY = yTop + 50;
    const barW = 220;
    const barH = 20;

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = "#00bfff";
    ctx.fillRect(barX, barY, barFill, barH);

    ctx.strokeStyle = "#888";
    ctx.strokeRect(barX, barY, barW, barH);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };
