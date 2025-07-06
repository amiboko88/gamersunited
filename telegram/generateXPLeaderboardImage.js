const { createCanvas, registerFont } = require("canvas");
const path = require("path");

// 🆔 טעינת פונט עברי
registerFont(path.join(__dirname, "../assets/NotoSansHebrew-Bold.ttf"), {
  family: "HebrewBold"
});

function getBarColor(percent) {
  if (percent < 0.4) return "#e74c3c";
  if (percent < 0.7) return "#f9a825";
  return "#00e676";
}

function drawText(ctx, text, x, y, font, align = "right") {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

function createLeaderboardImage(users) {
  const width = 900;
  const rowHeight = 100;
  const headerHeight = 110;
  const height = headerHeight + users.length * rowHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#101014";
  ctx.fillRect(0, 0, width, height);

  // 🏆 כותרת מיושרת תקין
  ctx.font = "bold 42px HebrewBold";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.fillText("‏🏆 טבלת מצטייני XP", width - 60, 70); // יש כאן תו יישור RTL

  users.forEach((u, i) => {
    const y = headerHeight + i * rowHeight;
    const level = u.level || 1;
    const xp = u.xp || 0;
    const nextXP = level * 25;
    const percent = Math.min(xp / nextXP, 1);
    const percentText = `${Math.round(percent * 100)}%`;
    const barColor = getBarColor(percent);

    const name = `${u.fullName || u.username || "אנונימי"}`;
    const xpDisplay = `‏XP ${xp} מתוך ${nextXP} · רמה ${level}`; // RTL יישור תקין

    // רקע שורה
    ctx.fillStyle = i % 2 === 0 ? "#1a1a27" : "#1e1e2e";
    ctx.fillRect(40, y, width - 80, rowHeight - 12);

    // בר התקדמות
    const barX = 70;
    const barY = y + 30;
    const barW = 300;
    const barH = 35;
    const fillW = Math.floor(barW * percent);

    ctx.fillStyle = "#444";
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, fillW, barH);

    // אחוז בתוך הבר
    ctx.font = "bold 15px HebrewBold";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(percentText, barX + barW / 2, barY + 23);

    // שם משתמש
    drawText(ctx, name, width - 90, y + 35, "bold 24px HebrewBold");

    // XP מתחת
    drawText(ctx, xpDisplay, width - 90, y + 70, "18px HebrewBold");
  });

  return canvas.toBuffer("image/png");
}

module.exports = { createLeaderboardImage };
