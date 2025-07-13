// 📁 commands/birthdayPanel.js (מעודכן לעיצוב איכותי ומקצועי יותר)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ניהול_ימיהולדת')
    .setDescription('🎉 מרכז ניהול ימי הולדת בקהילה'), // ✅ תיאור מפורט יותר

  async execute(interaction) {
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    const embed = new EmbedBuilder()
      .setTitle('🎂 לוח בקרה: ימי הולדת בקהילה') // ✅ כותרת ברורה ומקצועית יותר
      .setDescription([
        'ברוכים הבאים למרכז ניהול ימי ההולדת של שמעון!',
        'כאן תוכלו לצפות בלוח ימי ההולדת, להוסיף את תאריך הלידה שלכם, ולנהל את נתוני הקהילה.',
        '',
        '**בחרו פעולה מתפריט הבחירה או השתמשו בכפתור המהיר להוספה:**'
      ].join('\n')) // ✅ תיאור עשיר יותר
      .setColor('#FF69B4') // ✅ צבע ורוד/סגול יותר חגיגי ונעים
      .setThumbnail(interaction.client.user.displayAvatarURL()) // ✅ תמונת פרופיל של הבוט
      .setFooter({ text: 'שמעון BOT – חוגגים את החיים יחד! 🎉' }) // ✅ פוטר מפורט
      .setTimestamp();

    // ➕ כפתור "הוסף יום הולדת" נשאר כפתור ישיר
    const addBirthdayButton = new ButtonBuilder()
        .setCustomId('bday_add')
        .setLabel('➕ הוסף יום הולדת')
        .setStyle(ButtonStyle.Success) // ירוק לבולטות
        .setEmoji('🎂'); // ✅ אימוג'י

    const mainRow = new ActionRowBuilder().addComponents(addBirthdayButton);

    // ✅ תפריט בחירה עבור שאר הפעולות
    const selectMenuRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('birthday_action_select') // ✅ customId חדש לסלקטור
        .setPlaceholder('בחר פעולה מתוך רשימת ימי ההולדת ⬇️') // ✅ טקסט פלייס-הולדר
        .addOptions(
          {
            label: '🎁 רשימת ימי הולדת מלאה',
            description: 'הצג את כל ימי ההולדת הרשומים בקהילה לפי חודש.',
            value: 'bday_list',
            emoji: '🗓️' // ✅ אימוג'י
          },
          {
            label: '🔮 יום ההולדת הבא',
            description: 'הצג את היום הולדת הקרוב ביותר לחגוג.',
            value: 'bday_next',
            emoji: '✨' // ✅ אימוג'י
          },
          {
            label: '❓ משתמשים ללא יום הולדת',
            description: 'הצג רשימה של משתמשים מאומתים שטרם הזינו תאריך לידה.',
            value: 'bday_missing',
            emoji: '👤', // ✅ אימוג'י
            default: false,
            // אם המשתמש הוא אדמין, הלחצן יהיה פעיל, אחרת מנוטרל
            // לא ניתן לשלוט ב-disabled של אופציה בסלקטור, אלא רק בלחצן עצמו.
            // לכן, רק התצוגה תהיה זמינה, והלוגיקה הפנימית תבדוק הרשאות
          },
          // אפשר להוסיף פעולות אדמין נוספות כאופציות, ולוודא הרשאות ב-handler
        )
    );

    // אם המשתמש הוא אדמין, נוסיף לחצן ספציפי לשליחת תזכורת
    // (אפשרות זו מחוץ לסלקטור, כפתור מפורש לאדמין)
    if (isAdmin) {
        selectMenuRow.components[0].addOptions({
            label: '📨 שלח תזכורת למשתמשים חסרים (אדמין)',
            description: 'שלח DM למשתמשים שטרם הזינו תאריך לידה.',
            value: 'bday_remind_missing_admin', // ✅ customId חדש לאדמין
            emoji: '📢'
        });
    }


    await interaction.reply({
      embeds: [embed],
      components: [mainRow, selectMenuRow] // ✅ שתי שורות: כפתור מהיר וסלקטור
    });
  }
};