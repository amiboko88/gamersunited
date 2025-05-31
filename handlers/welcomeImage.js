const { createCanvas, loadImage, registerFont } = require('canvas');
const { AttachmentBuilder } = require('discord.js');
const path = require('path');

// מזהה ערוץ הברכות שלך
const WELCOME_CHANNEL_ID = '689067371843158026';

// יש להוריד ולהוסיף גופן עברי בתיקיית fonts (אפשר גם Arial, אבל עברית תצא יפה יותר)
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

      // 1000x420 בדיוק כמו MEE6
      const width = 1000;
      const height = 420;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // רקע שחור חלק (כמו MEE6)
      ctx.fillStyle = '#18191c';
      ctx.fillRect(0, 0, width, height);

      // פרופיל עגול – ממורכז
      const avatarSize = 120;
      const avatarX = width / 2 - avatarSize / 2;
      const avatarY = 40;
      // טבעת לבנה מסביב
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
      // תמונת פרופיל עגולה
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      // טקסט "ברוך הבא" – מרכז
      ctx.font = 'bold 38px "Noto Sans Hebrew"';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.direction = 'rtl';
      ctx.fillText('ברוך הבא', width / 2, 200);

      // שם המשתמש – גדול ומרכזי
      ctx.font = 'bold 32px "Noto Sans Hebrew"';
      ctx.fillText(`${member.user.username}`, width / 2, 250);

      // משתמש מספר – צהוב כמו בדוגמה הקודמת, מתחת
      ctx.font = 'bold 26px "Noto Sans Hebrew"';
      ctx.fillStyle = '#FFE98B';
      ctx.fillText(`משתמש מספר ${memberCount}`, width / 2, 290);

      // לוגו קטן בפינה שמאל תחתונה (חותמת)
      const logoWidth = 56;
      const logoHeight = 56;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(logo, 35, height - logoHeight - 32, logoWidth, logoHeight);
      ctx.globalAlpha = 1.0;

      // טקסט "GAMERS UNITED IL" מתחת ללוגו
      ctx.font = 'bold 21px "Noto Sans Hebrew"';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.fillText('GAMERS UNITED IL', 35 + logoWidth + 10, height - logoHeight / 2 + 7);

      // המרת קנבס לתמונה
      const buffer = canvas.toBuffer('image/png');
      const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });

      await channel.send({ files: [attachment] });
    } catch (err) {
      console.error('Failed to send welcome image:', err);
    }
  });
};
