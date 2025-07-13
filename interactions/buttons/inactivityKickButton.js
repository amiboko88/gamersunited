// 📁 interactions/buttons/inactivityKickButton.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/firebase'); // נתיב יחסי נכון
const { sendStaffLog } = require('../../utils/staffLogger'); // נתיב יחסי נכון

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

  const eligibleToKick = allTracked.docs.filter(doc => {
    const d = doc.data();
    return ['failed_dm', 'final_warning', 'final_warning_auto'].includes(d.statusStage || '') && d.statusStage !== 'left';
  });

  for (const doc of eligibleToKick) {
    const userId = doc.id;
    const member = members.get(userId);

    if (!member) {
      notInGuild.push(`<@${userId}>`);
      await db.collection('memberTracking').doc(userId).delete();
      await sendStaffLog(client, '🧹 ניקוי משתמש (לא בשרת)', `המשתמש <@${userId}> לא נמצא בשרת ונמחק ממעקב הפעילות.`, 0x808080);
      continue;
    }

    try {
      await member.kick('בעיטה לפי סטטוס – לא פעיל + חסום + לא הגיב');
      await db.collection('memberTracking').doc(userId).delete();
      kickedList.push(`<@${userId}>`);
      count++;
      await sendStaffLog(client, '👢 משתמש הורחק', `המשתמש <@${userId}> הורחק מהשרת בהצלחה.`, 0xFF3300, [{ name: 'סיבה', value: 'לא פעיל + חסום + לא הגיב' }]);
    } catch (err) {
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
  // תיקון: שימוש ב-flags במקום ephemeral
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { count, kickedList, notInGuild, failedKick } = await executeKickFailedUsers(client);

  const summaryEmbed = new EmbedBuilder()
    .setTitle('🛑 סיכום פעולת הרחקת משתמשים')
    .setDescription(`**הושלמה פעולת הרחקה ידנית.**`)
    .addFields(
        { name: `👢 הורחקו בהצלחה (${count})`, value: kickedList.length ? kickedList.join('\n').slice(0, 1024) : '—', inline: false },
        { name: `🚫 לא בשרת (נמחקו מהמעקב) (${notInGuild.length})`, value: notInGuild.length ? notInGuild.join('\n').slice(0, 1024) : '—', inline: false },
        { name: `⚠️ נכשלו בהרחקה (${failedKick.length})`, value: failedKick.length ? failedKick.join('\n').slice(0, 1024) : '—', inline: false }
     )
    .setColor(0xff3300)
    .setTimestamp()
    .setFooter({ text: 'Shimon BOT — ניהול משתמשים' });

  const staffChannel = client.channels.cache.get(process.env.STAFF_CHANNEL_ID);
  if (staffChannel) {
      await staffChannel.send({ embeds: [summaryEmbed] });
  } else {
      console.warn(`[STAFF_LOG] ⚠️ ערוץ הצוות לא נמצא (ID: ${process.env.STAFF_CHANNEL_ID}). סיכום הרחקה לא נשלח.`);
  }

  return interaction.editReply({ content: '✅ הפעולה בוצעה. סיכום נשלח לערוץ הצוות.', flags: MessageFlags.Ephemeral });
};

const customId = (interaction) => {
  return interaction.customId === 'kick_failed_users';
};

module.exports = {
  customId,
  execute,
  executeKickFailedUsers // ייצוא הפונקציה לשימוש ע"י Cron jobs אם צריך
};