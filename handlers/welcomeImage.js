const { createCanvas, loadImage, registerFont } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');

const WELCOME_CHANNEL_ID = '689067371843158026';
registerFont(path.join(__dirname, '..', 'assets', 'NotoSansHebrew-Bold.ttf'), { family: 'Noto Sans Hebrew' });

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    try {
      const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
      if (!channel) return;

      const memberCount = member.guild.memberCount;
      const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
      const avatar = await loadImage(avatarURL);
      const logo = await loadImage(path.join(__dirname, '..', 'assets', 'logo.png'));

      const width = 1000;
      const height = 420;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // === רקע גרדיאנט זהב-כהה מותאם ללוגו ===
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#181818");   // כהה שמאל למעלה
      gradient.addColorStop(0.42, "#33281b"); // חום־זהב
      gradient.addColorStop(0.8, "#f3a021"); // זהב כתום
      gradient.addColorStop(1, "#e8c45a");   // זהוב-צהבהב
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // === עיגול פרופיל ענק במרכז עליון ===
      const avatarSize = 172; // יותר גדול!
      const avatarX = width / 2 - avatarSize / 2;
      const avatarY = 44;
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2 + 8, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // === טקסט "ברוך הבא [שם]" בשורה אחת, קצת יותר נמוך ===
      ctx.font = 'bold 46px "Noto Sans Hebrew"';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      const username = member.user.username;
      ctx.fillText(`ברוך הבא ${username}`, width / 2, 270); // הורדנו עוד יותר

      // === טקסט משתמש מספר – מתחת, זהוב, לא זז ===
      ctx.font = 'bold 30px "Noto Sans Hebrew"';
      ctx.fillStyle = '#FFE98B';
      ctx.fillText(`משתמש מספר ${memberCount}`, width / 2, 320);

      // === לוגו בפינה שמאל תחתונה ===
      const logoWidth = 64;
      const logoHeight = 64;
      const logoX = 44;
      const logoY = height - logoHeight - 60;
      ctx.globalAlpha = 0.98;
      ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);
      ctx.globalAlpha = 1.0;

      // === טקסט GAMERS UNITED IL קטן יותר, מתחת ללוגו וממוסגר היטב ===
      ctx.font = 'bold 17px "Noto Sans Hebrew"';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.direction = 'ltr';
      ctx.fillText('GAMERS UNITED IL', logoX + logoWidth / 2, logoY + logoHeight + 22);

      // === הפיכת קנבס לתמונה ===
      const buffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });

      await channel.send({ files: [attachment] });
    } catch (err) {
      console.error('Failed to send welcome image:', err);
    }
  });
};
