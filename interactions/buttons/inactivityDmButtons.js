// 📁 interactions/buttons/inactivityDmButtons.js
const { ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserRef } = require('../../utils/userUtils');
const { sendStaffLog } = require('../../utils/staffLogger');
// ✅ ייבוא מסודר מה-Handler (שובר את המעגל)
const { runAutoTracking, sendReminderDM } = require('../../handlers/inactivityCronJobs');

/**
 * מטפל בלחיצה של משתמש על "אני חי"
 */
async function handleAliveButton(interaction) {
    const userId = interaction.user.id;
    
    try {
        const userRef = await getUserRef(userId, 'discord');
        await userRef.set({
            tracking: {
                statusStage: 'active',
                lastAliveResponse: new Date().toISOString()
            },
            meta: {
                lastActive: new Date().toISOString()
            }
        }, { merge: true });

        await interaction.update({
            content: '✅ תודה שאישרת! שמחים שאתה איתנו. הסטטוס שלך עודכן ל"פעיל".',
            components: [],
            embeds: [] 
        });

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
 * זיהוי הכפתור
 */
const customId = (interaction) => {
  return interaction.customId === 'send_dm_warnings_7' || 
         interaction.customId === 'send_dm_warnings_30' ||
         interaction.customId === 'i_am_alive';
};

const execute = async (interaction, client) => {
  // 1. משתמש לוחץ "אני חי"
  if (interaction.customId === 'i_am_alive') {
      await handleAliveButton(interaction);
      return;
  }

  // 2. אדמין לוחץ על הפעלת אזהרות
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
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

// מייצאים גם את sendReminderDM למקרה שמישהו אחר יצטרך אותו, אבל הוא מיובא מה-Handler
module.exports = { customId, execute, sendReminderDM };