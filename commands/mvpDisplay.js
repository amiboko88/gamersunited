const { SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const fontPath = path.join(__dirname, '../assets/DejaVuSans.ttf');
if (!fs.existsSync(fontPath)) {
  console.error('❌ קובץ הפונט לא נמצא:', fontPath);
  return;
}
registerFont(fontPath, { family: 'DejaVuSans' });

const data = new SlashCommandBuilder()
  .setName('אלופים')
  .setDescription('האלופים של כל הזמנים לפי דקות שיחה');

async function execute(interaction, client) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const db = client.db;
    const snapshot = await db.collection('voiceLifetime').get();

    const totals = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const id = doc.id;
      const minutes = data.total || 0;
      if (minutes > 0) {
        totals.push({ id, minutes });
      }
    });

    const active = totals
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    if (active.length === 0) {
      return interaction.editReply({
        content: 'אין עדיין מצטיינים בשיחות קול.'
      });
    }

    const WIDTH = 1920;
    const HEIGHT = 1080;
    const PADDING = 80;
    const ROW_HEIGHT = 160;
    const AVATAR_SIZE = 100;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    ctx.direction = 'rtl';

    // רקע
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // כותרת
    ctx.font = 'bold 72px DejaVuSans';
    ctx.fillStyle = '#facc15';
    ctx.textAlign = 'center';
    ctx.fillText('אלופי כל הזמנים בשיחות קול 🎙️', WIDTH / 2, PADDING);

    for (let i = 0; i < active.length; i++) {
      const { id, minutes } = active[i];
      const user = await client.users.fetch(id).catch(() => null);
      const username = user?.username || `משתמש (${id.slice(-4)})`;
      const y = PADDING + 80 + i * ROW_HEIGHT;

      try {
        const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 128 }));
        ctx.save();
        ctx.beginPath();
        ctx.arc(PADDING + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, PADDING, y, AVATAR_SIZE, AVATAR_SIZE);
        ctx.restore();
      } catch {}

      const textX = PADDING + AVATAR_SIZE + 40;

      ctx.font = '36px DejaVuSans';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(username, textX, y + 42);

      ctx.font = '28px DejaVuSans';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${minutes.toLocaleString()} דקות מצטברות`, textX, y + 80);
    }

    const now = new Date();
    ctx.font = '22px DejaVuSans';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText(`עודכן: ${now.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`, PADDING, HEIGHT - 40);

    // יצירת הקובץ
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filename = `mvp_alltime_${Date.now()}.png`;
    const outputPath = path.join(tempDir, filename);
    fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));

    await interaction.editReply({
      files: [outputPath]
    });

    // מחיקה אוטומטית של הקובץ
    setTimeout(() => {
      fs.unlink(outputPath, () => {});
    }, 10000);

  } catch (err) {
    console.error('❌ שגיאה בביצוע /אלופים:', err);
    if (!interaction.replied) {
      await interaction.editReply({ content: 'אירעה שגיאה בהפקת התמונה 😕' });
    }
  }
}

module.exports = {
  data,
  execute
};
