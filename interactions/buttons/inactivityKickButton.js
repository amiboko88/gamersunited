// 📁 interactions/buttons/inactivityKickButton.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/firebase');
const { sendStaffLog } = require('../../utils/staffLogger');

/**
 * פונקציה שמבצעת הרחקה של משתמשים העומדים בקריטריונים לאי-פעילות.
 */
async function executeKickFailedUsers(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  
  // שליפה מה-DB המאוחד: רק מי שבסטטוסים שמצדיקים הרחקה
  const snapshot = await db.collection('users')
    .where('tracking.statusStage', 'in', ['failed_dm', 'final_warning_auto'])
    .get();

  let count = 0;
  let notInGuild = [];
  let failedKick = [];
  let kickedList = [];

  for (const doc of snapshot.docs) {
    const userId = doc.id;
    
    try {
        const member = await guild.members.fetch(userId);
        
        if (member) {
            await member.kick('אי-פעילות מתמשכת (Shimon Auto-Kick)');
            kickedList.push(`<@${userId}>`);
            count++;
            
            // עדכון ב-DB שהמשתמש הועף
            await doc.ref.update({ 
                'tracking.status': 'kicked',
                'tracking.kickedAt': new Date().toISOString()
            });
        }
    } catch (err) {
        if (err.code === 10007) { // Unknown Member
            notInGuild.push(userId);
            // אם הוא לא בשרת, נסמן אותו כעזב
            await doc.ref.update({ 'tracking.status': 'left' });
        } else {
            failedKick.push(`<@${userId}> (${err.message})`);
        }
    }
  }

  return { count, kickedList, notInGuild, failedKick };
}

const customId = (interaction) => interaction.customId === 'kick_inactive_users';

const execute = async (interaction, client) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { count, kickedList, notInGuild, failedKick } = await executeKickFailedUsers(client);

  const summaryEmbed = new EmbedBuilder()
    .setTitle('🛑 סיכום פעולת הרחקת משתמשים')
    .setDescription(`**הושלמה פעולת הרחקה ידנית.**`)
    .addFields(
        { name: `👢 הורחקו בהצלחה (${count})`, value: kickedList.length ? kickedList.join('\n').slice(0, 1024) : '—', inline: false },
        { name: `🚫 לא בשרת (סומנו כעזבו) (${notInGuild.length})`, value: notInGuild.length ? notInGuild.join('\n').slice(0, 1024) : '—', inline: false },
        { name: `⚠️ נכשלו בהרחקה (${failedKick.length})`, value: failedKick.length ? failedKick.join('\n').slice(0, 1024) : '—', inline: false }
     )
    .setColor(0xff3300)
    .setTimestamp()
    .setFooter({ text: 'Shimon BOT — ניהול משתמשים' });

  // שליחת לוג לצוות
  await sendStaffLog('👢 ביצוע הרחקה המונית', `בוצע ע"י <@${interaction.user.id}>`, 0xff0000, []);
  
  await interaction.editReply({ embeds: [summaryEmbed] });
};

module.exports = { customId, execute };