// 📁 commands/activityBoard.js
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1375415546769838120';
const COVER_PATH = path.join(__dirname, '../assets/schedulecover.png');

const weeklySchedule = [
  { day: 'ראשון', emoji: '🔵', desc: 'טורניר פיפו סודי — מתכוננים לקרב חיי הלילה' },
  { day: 'שני', emoji: '🟢', desc: 'ערב Resurgence עם הקבועים. צחוקים, קרינג׳, וצרחות' },
  { day: 'שלישי', emoji: '🟡', desc: 'GUN GAME לכל הרעבים לדם (ואל תשכחו אוזניות)' },
  { day: 'רביעי', emoji: '🟣', desc: 'ערב חידות ומשימות משוגעות עם פרסים בסוף' },
  { day: 'חמישי', emoji: '🟠', desc: 'קלאן-וור נדיר! כולם באים, לא מעניין אותנו תירוצים' },
  { day: 'שבת', emoji: '🔴', desc: 'מוצ"ש של אש! סשן לילה עד שהאצבעות נמסות' },
];

// כפתורים מפוצצים וצבעוניים
const buttonRows = [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('like_sunday').setLabel('🔥 ראשון').setStyle(ButtonStyle.Danger).setEmoji('🔵'),
    new ButtonBuilder().setCustomId('like_monday').setLabel('💚 שני').setStyle(ButtonStyle.Success).setEmoji('🟢'),
    new ButtonBuilder().setCustomId('like_tuesday').setLabel('💛 שלישי').setStyle(ButtonStyle.Primary).setEmoji('🟡'),
    new ButtonBuilder().setCustomId('like_wednesday').setLabel('💜 רביעי').setStyle(ButtonStyle.Secondary).setEmoji('🟣'),
    new ButtonBuilder().setCustomId('like_thursday').setLabel('🧡 חמישי').setStyle(ButtonStyle.Danger).setEmoji('🟠')
  ),
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('like_saturday').setLabel('❤️‍🔥 שבת').setStyle(ButtonStyle.Success).setEmoji('🔴'),
    new ButtonBuilder().setCustomId('like_all').setLabel('💯 בא לכל השבוע!').setStyle(ButtonStyle.Primary).setEmoji('🌟')
  )
];

// דינמיקה — אפשר לעבור לשאיבת RSVP ממסד נתונים אם תרצה!
const rsvpCounts = {}; // { like_sunday: 3, ... }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('שלח או עדכן את לוח הפעילות השבועי (הכי מקצועי ויפה!'),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
      // שלח קודם כל את התמונה הראשית — אם טרם קיימת/נעוצה (אפשר למחוק ישנות אוטומטית לפי הצורך)
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel || !channel.isTextBased()) throw 'ערוץ לא תקין!';
      const buffer = fs.readFileSync(COVER_PATH);
      const coverAttachment = new AttachmentBuilder(buffer, { name: 'schedulecover.png' });

      // בנה את Embed הטקסטואלי המקצועי
      const desc = weeklySchedule.map((e, i) =>
        `${e.emoji} **${e.day}:** ${e.desc} ${rsvpCounts['like_' + e.day.toLowerCase()] ? '— 🟩 ' + rsvpCounts['like_' + e.day.toLowerCase()] + ' הצבעות' : ''}`
      ).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('📅 לוח פעילות שבועי – GAMERS UNITED IL')
        .setDescription(desc)
        .setImage('attachment://schedulecover.png')
        .setColor('#00B2FF')
        .setFooter({ text: 'הכי מקצועי בארץ | שבת שלום' })
        .setTimestamp();

      await channel.send({
        embeds: [embed],
        files: [coverAttachment],
        components: buttonRows
      });

      await interaction.editReply('✅ לוח פעילות שבועי חדש נשלח לערוץ בהצלחה!');
    } catch (err) {
      console.error('שגיאה בהפעלת לוח פעילות:', err);
      await interaction.editReply('❌ שגיאה בשליחת הלוח. בדוק הרשאות/לוגים.');
    }
  }
};
