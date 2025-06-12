const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

function registerMvpCommand(commands) {
  commands.push(
    new SlashCommandBuilder()
      .setName('מצטיין_שבוע')
      .setDescription('📈 טבלת התקדמות חיה למצטיין השבועי (גרפי)')
      .toJSON()
  );
}

async function execute(interaction, client) {
  await interaction.deferReply({ flags: 64 });

  const db = client.db;
  const voiceRef = await db.collection('voiceTime').get();

  const active = [];

  voiceRef.forEach(doc => {
    const data = doc.data();
    if (data.minutes > 0) {
      active.push({ id: doc.id, minutes: data.minutes });
    }
  });

  if (active.length === 0) {
    return interaction.editReply({
      content: '😴 אף אחד לא התחבר השבוע לערוץ קול... תתעוררו!',
      ephemeral: true
    });
  }

  active.sort((a, b) => b.minutes - a.minutes);
  const maxMinutes = active[0].minutes;
  const top = active.slice(0, 10);

  // 🎨 יצירת Canvas
  const width = 1200;
  const rowHeight = 100;
  const height = rowHeight * top.length + 150;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // רקע
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  // כותרת
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 50px sans-serif';
  ctx.fillText('📈 דירוג שבועי – מי הכי קרוב ל־MVP?', 50, 70);

  for (let i = 0; i < top.length; i++) {
    const user = await client.users.fetch(top[i].id).catch(() => null);
    const minutes = top[i].minutes;
    const percent = Math.round((minutes / maxMinutes) * 100);
    const y = 120 + i * rowHeight;

    // אווטאר
    try {
      const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 128 }));
      ctx.save();
      ctx.beginPath();
      ctx.arc(90, y + 40, 35, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, 55, y + 5, 70, 70);
      ctx.restore();
    } catch {}

    // שם ודקות
    ctx.fillStyle = '#ffffff';
    ctx.font = '28px sans-serif';
    ctx.fillText(user?.username || 'משתמש לא ידוע', 140, y + 35);
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '24px sans-serif';
    ctx.fillText(`${minutes} דקות (${percent}%)`, 140, y + 65);

    // פס התקדמות
    const barWidth = 600;
    const barX = 500;
    const filled = (percent / 100) * barWidth;
    ctx.fillStyle = '#10b981';
    ctx.fillRect(barX, y + 25, filled, 20);
    ctx.fillStyle = '#334155';
    ctx.fillRect(barX + filled, y + 25, barWidth - filled, 20);
  }

  // יצירת קובץ
  const outputPath = path.join(__dirname, '../temp/mvp_live.png');
  const dirPath = path.dirname(outputPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  await interaction.editReply({
    content: '⬇️ מצב LIVE – התקדמות לעבר ה־MVP:',
    files: [outputPath]
  });
}

module.exports = {
  registerMvpCommand,
  execute
};
