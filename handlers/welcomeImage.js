const { createCanvas, loadImage, registerFont } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');

const WELCOME_CHANNEL_ID = '689067371843158026';

// גופן עברי
registerFont(path.join(__dirname, '..', 'assets', 'NotoSansHebrew-Bold.ttf'), {
  family: 'Noto Sans Hebrew'
});

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    try {
      const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID);
      if (!channel) return;

      const memberCount = member.guild.memberCount;
      const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
      const avatar = await loadImage(avatarURL);

      // טוען את הלוגו החדש (רק G שקוף)
      const logo = await loadImage(path.join(__dirname, '..', 'assets', 'onlyg.png'));

      // הגדרת קנבס
      const width = 1000;
      const height = 420;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // רקע גרדיאנט תואם ללוגו
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#181818");
      gradient.addColorStop(0.45, "#33281b");
      gradient.addColorStop(0.8, "#f3a021");
      gradient.addColorStop(1, "#e8c45a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // תמונת פרופיל – עיגול ענק
      const avatarSize = 172;
      const avatarX = width / 2 - avatarSize / 2;
      const avatarY = 44;

      // טבעת לבנה מסביב
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2 + 8, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();

      // תמונת הפרופיל עצמה
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // טקסט ברוך הבא [שם]
      ctx.font = 'bold 46px "Noto Sans Hebrew"';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      const username = member.user.username;
      ctx.fillText(`ברוך הבא ${username}`, width / 2, 270);

      // טקסט משתמש מספר
      ctx.font = 'bold 30px "Noto Sans Hebrew"';
      ctx.fillStyle = '#FFE98B';
      ctx.fillText(`משתמש מספר ${memberCount}`, width / 2, 320);

      // לוגו G בלבד – גדול בפינה שמאל תחתונה
      const logoWidth = 84;
      const logoHeight = 84;
      const logoX = 35;
      const logoY = height - logoHeight - 40;
      ctx.globalAlpha = 1;
      ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);

      // שליחה
      const buffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });
      await channel.send({ files: [attachment] });

    } catch (err) {
      console.error('❌ Failed to send welcome image:', err);
    }
  });
};
