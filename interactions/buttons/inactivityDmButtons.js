// 📁 interactions/buttons/inactivityDmButtons.js
const { ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserRef } = require('../../utils/userUtils'); // ✅ עבודה מול ה-DB המאוחד
const { sendStaffLog } = require('../../utils/staffLogger');
const { runAutoTracking } = require('../../handlers/inactivityCronJobs'); // שימוש בלוגיקה המרכזית

/**
 * שולח הודעת תזכורת למשתמש (פונקציה זו נקראת ע"י כפתור ידני או אוטומציה)
 */
async function sendReminderDM(client, userId, type) {
  try {
    const user = await client.users.fetch(userId);
    const isFinal = type === 'final_warning';

    const embed = new EmbedBuilder()
      .setTitle(isFinal ? '🚨 התראה אחרונה לפני הרחקה' : '👋 היי, נעלמת לנו!')
      .setDescription(isFinal 
        ? 'שמנו לב שאתה לא פעיל בשרת כבר תקופה ארוכה ולא הגבת להודעות קודמות.\nאם לא תהיה פעיל בימים הקרובים, המערכת תאלץ להסיר אותך כדי לפנות מקום.'
        : 'אנחנו עושים סדר בשרת ושמנו לב שלא היית פעיל הרבה זמן.\nאתה עדיין איתנו? תן סימן חיים בצ\'אט או בחדרים הקוליים! 🎮')
      .setColor(isFinal ? 0xFF0000 : 0xFFA500)
      .setFooter({ text: 'Gamers United Bot • ניהול קהילה' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('i_am_alive') // ✅ הכפתור שהמשתמש לוחץ עליו
        .setLabel('אני כאן! אל תמחק אותי')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🙋‍♂️')
    );

    await user.send({ embeds: [embed], components: [row] });
    return true;
  } catch (e) {
    return false; // DM חסום
  }
}

/**
 * מטפל בלחיצה של משתמש על "אני חי"
 */
async function handleAliveButton(interaction) {
    const userId = interaction.user.id;
    
    try {
        // 1. עדכון ב-DB שהמשתמש פעיל
        const userRef = await getUserRef(userId, 'discord');
        await userRef.set({
            tracking: {
                statusStage: 'active', // איפוס הסטטוס
                lastAliveResponse: new Date().toISOString()
            },
            meta: {
                lastActive: new Date().toISOString()
            }
        }, { merge: true });

        // 2. תגובה למשתמש
        await interaction.update({
            content: '✅ תודה שאישרת! שמחים שאתה איתנו. הסטטוס שלך עודכן ל"פעיל".',
            components: [], // מחיקת הכפתור כדי שלא ילחץ שוב
            embeds: [] 
        });

        // 3. לוג לצוות
        await sendStaffLog(
            '🟢 משתמש הגיב לאזהרה',
            `המשתמש <@${userId}> לחץ על כפתור "אני כאן". הסטטוס שלו אופס.`,
            0x00FF00
        );

    } catch (error) {
        console.error('Error handling i_am_alive:', error);
        await interaction.reply({ content: '❌ שגיאה בעדכון הסטטוס.', flags: MessageFlags.Ephemeral });
    }
}

/**
 * זיהוי הכפתור (גם אדמין וגם משתמש)
 */
const customId = (interaction) => {
  return interaction.customId === 'send_dm_warnings_7' || 
         interaction.customId === 'send_dm_warnings_30' ||
         interaction.customId === 'i_am_alive'; // ✅ הוספתי את הזיהוי הזה
};

const execute = async (interaction, client) => {
  // 1. אם זה משתמש שלחץ "אני חי"
  if (interaction.customId === 'i_am_alive') {
      await handleAliveButton(interaction);
      return;
  }

  // 2. אם זה אדמין שלחץ על "שלח אזהרות"
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
      // הרצת הלוגיקה המרכזית (כדי לא לשכפל קוד)
      // זה יבצע סריקה וישלח הודעות לכל מי שרלוונטי
      await runAutoTracking(client); 
      
      await interaction.editReply({ 
          content: '✅ פקודת שליחת התזכורות הופעלה בהצלחה.\nדוח מפורט נשלח לערוץ הצוות.',
          embeds: []
      });
  } catch (e) {
      console.error(e);
      await interaction.editReply({ content: '❌ שגיאה בהרצת התהליך.' });
  }
};

module.exports = { customId, execute, sendReminderDM };