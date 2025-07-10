// 📁 interactions/buttons/inactivityKickButton.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/firebase'); // נתיב יחסי נכון ל-firebase.js
const { sendStaffLog } = require('../../utils/staffLogger'); // נתיב יחסי נכון ל-staffLogger.js

/**
 * פונקציה שמבצעת הרחקה של משתמשים העומדים בקריטריונים לאי-פעילות.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 * @returns {Promise<{count: number, kickedList: string[], notInGuild: string[], failedKick: string[]}>} - סיכום תוצאות הפעולה.
 */
async function executeKickFailedUsers(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const allTracked = await db.collection('memberTracking').get();
  let count = 0;
  let notInGuild = [];
  let failedKick = [];
  let kickedList = [];

  // סינון משתמשים כשירים להרחקה:
  // משתמשים שהסטטוס שלהם הוא 'failed_dm', 'final_warning', או 'final_warning_auto'
  // וטרם סומנו כ'left' (עזבו את השרת)
  const eligibleToKick = allTracked.docs.filter(doc => {
    const d = doc.data();
    return ['failed_dm', 'final_warning', 'final_warning_auto'].includes(d.statusStage || '') && d.statusStage !== 'left';
  });

  for (const doc of eligibleToKick) {
    const userId = doc.id;
    const member = members.get(userId);

    // אם המשתמש לא נמצא בשרת, ננקה אותו מהמעקב ב-Firebase
    if (!member) {
      notInGuild.push(`<@${userId}>`);
      await db.collection('memberTracking').doc(userId).delete();
      await sendStaffLog(client, '🧹 ניקוי משתמש (לא בשרת)', `המשתמש <@${userId}> לא נמצא בשרת ונמחק ממעקב הפעילות.`, 0x808080);
      continue;
    }

    try {
      // נבצע הרחקה של המשתמש מהשרת
      await member.kick('בעיטה לפי סטטוס – לא פעיל + חסום + לא הגיב');
      // נמחק את המשתמש ממעקב הפעילות ב-Firebase לאחר הרחקה מוצלחת
      await db.collection('memberTracking').doc(userId).delete();
      kickedList.push(`<@${userId}>`);
      count++;
      // נשלח לוג לערוץ הצוות על הרחקה מוצלחת
      await sendStaffLog(client, '👢 משתמש הורחק', `המשתמש <@${userId}> הורחק מהשרת בהצלחה.`, 0xFF3300, [{ name: 'סיבה', value: 'לא פעיל + חסום + לא הגיב' }]);
    } catch (err) {
      // אם ההרחקה נכשלה, נוסיף לרשימת הכשלונות ונשלח לוג שגיאה לצוות
      failedKick.push(`<@${userId}>`);
      await sendStaffLog(client, '❌ כשל בהרחקה', `נכשל ניסיון הרחקת המשתמש <@${userId}>: \`\`\`${err.message}\`\`\``, 0xFF0000);
    }
  }
  return { count, kickedList, notInGuild, failedKick };
}

/**
 * פונקציית handler לכפתור הרחקת משתמשים.
 * @param {import('discord.js').ButtonInteraction} interaction - אובייקט האינטראקציה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
const execute = async (interaction, client) => {
  await interaction.deferReply({ ephemeral: true });

  const { count, kickedList, notInGuild, failedKick } = await executeKickFailedUsers(client);

  // בניית Embed לסיכום פעולת ההרחקה
  const summaryEmbed = new EmbedBuilder()
    .setTitle('🛑 סיכום פעולת הרחקת משתמשים')
    .setDescription(`**הושלמה פעולת הרחקה ידנית.**`)
    .addFields(
        { name: `👢 הורחקו בהצלחה (${count})`, value: kickedList.length ? kickedList.join('\n').slice(0, 1024) : '—', inline: false },
        { name: `🚫 לא בשרת (נמחקו מהמעקב) (${notInGuild.length})`, value: notInGuild.length ? notInGuild.join('\n').slice(0, 1024) : '—', inline: false },
        { name: `⚠️ נכשלו בהרחקה (${failedKick.length})`, value: failedKick.length ? failedKick.join('\n').slice(0, 1024) : '—', inline: false }
     )
    .setColor(0xff3300) // אדום עמוק
    .setTimestamp()
    .setFooter({ text: 'Shimon BOT — ניהול משתמשים' });

  // שליחת הסיכום לערוץ הצוות
  const staffChannel = client.channels.cache.get(process.env.STAFF_CHANNEL_ID);
  if (staffChannel) {
      await staffChannel.send({ embeds: [summaryEmbed] });
  } else {
      console.warn(`[STAFF_LOG] ⚠️ ערוץ הצוות לא נמצא (ID: ${process.env.STAFF_CHANNEL_ID}). סיכום הרחקה לא נשלח.`);
  }


  return interaction.editReply({ content: '✅ הפעולה בוצעה. סיכום נשלח לערוץ הצוות.', ephemeral: true });
};

// ה-customId שייקלט על ידי ה-client.on('interactionCreate')
// ויופנה ל-handler זה (כפונקציה דינמית)
const customId = (interaction) => {
  return interaction.customId === 'kick_failed_users';
};

module.exports = {
  customId,
  execute,
};