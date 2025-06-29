const { createCanvas, registerFont } = require("canvas");
const path = require("path");

// טען פונט רק אם קיים
try {
  registerFont(path.join(__dirname, "assets", "NotoSansHebrew-Bold.ttf"), {
    family: "Noto"
  });
} catch (e) {
  console.warn("⚠️ פונט לא נטען, משתמשים בברירת מחדל.");
}

function drawTextWithShadow(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#00000080";
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  if (!users || users.length === 0) return null;

  const width = 800;
  const rowHeight = 90;
  const headerHeight = 100;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1c1b29";
  ctx.fillRect(0, 0, width, height);

  drawTextWithShadow(ctx, "📈 טבלת מצטייני XP", width / 2, 55, "bold 34px 'Noto'", "center");

  ctx.strokeStyle = "#ffffff33";
  ctx.beginPath();
  ctx.moveTo(60, 70);
  ctx.lineTo(width - 60, 70);
  ctx.stroke();

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const yTop = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const fill = Math.floor(percent * 220);

    ctx.fillStyle = i % 2 === 0 ? "#262638" : "#2e2e45";
    ctx.fillRect(30, yTop, width - 60, rowHeight - 10);

    // מדליית emoji
    const medalEmoji = ["🥇", "🥈", "🥉"][i] || "";
    drawTextWithShadow(ctx, `${medalEmoji} 🧠 ${u.fullName || u.username || "אנונימי"}`, width - 90, yTop + 35, "bold 22px 'Noto'");

    drawTextWithShadow(ctx, `🏅 רמה ${level} – ${xp} XP`, width - 90, yTop + 60, "18px 'Noto'");

    const barX = 60, barY = yTop + 50, barW = 220, barH = 20;

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = "#00bfff";
    ctx.fillRect(barX, barY, fill, barH);

    ctx.strokeStyle = "#888";
    ctx.strokeRect(barX, barY, barW, barH);
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };
