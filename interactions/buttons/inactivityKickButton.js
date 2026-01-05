// 📁 interactions/buttons/inactivityKickButton.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/firebase');
const { sendStaffLog } = require('../../utils/staffLogger');

/**
 * פונקציה שמבצעת הרחקה של משתמשים העומדים בקריטריונים לאי-פעילות.
 */
async function executeKickFailedUsers(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  
  // שליפה מה-DB המאוחד (users)
  // משתמשים שהגיעו לשלב אזהרה סופית או שנכשלו ב-DM
  const snapshot = await db.collection('users')
    .where('tracking.statusStage', 'in', ['failed_dm', 'final_warning_auto'])
    .get();

  let count = 0;
  let notInGuild = [];
  let failedKick = [];
  let kickedList = [];

  for (const doc of snapshot.docs) {
    const userId = doc.id;
    const userData = doc.data();
    
    // מנגנון הגנה כפול: בדיקה שזמן הפעילות האחרון באמת עבר את ה-30 יום
    // (למקרה שהסטטוס ב-DB לא התעדכן אבל המשתמש כן היה פעיל)
    const lastActive = userData.meta?.lastActive || userData.tracking?.lastActivity;
    if (lastActive) {
        const daysInactive = (Date.now() - new Date(lastActive).getTime()) / (1000 * 60 * 60 * 24);
        if (daysInactive < 30) {
            console.log(`Skipping kick for ${userId}: status is bad but active ${Math.floor(daysInactive)} days ago.`);
            continue; 
        }
    }

    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        
        if (member) {
            if (member.kickable) {
                await member.kick('אי-פעילות מתמשכת (Shimon Auto-Kick)');
                kickedList.push(`<@${userId}>`);
                count++;
                
                // עדכון ב-DB שהמשתמש הועף
                await doc.ref.update({ 
                    'tracking.status': 'kicked',
                    'tracking.kickedAt': new Date().toISOString()
                });
            } else {
                failedKick.push(`<@${userId}> (אין הרשאות לבוט)`);
            }
        } else {
            // משתמש כבר לא בשרת, נסמן אותו כעזב
            notInGuild.push(`<@${userId}>`);
            await doc.ref.update({ 'tracking.status': 'left' });
        }
    } catch (err) {
        failedKick.push(`<@${userId}> (${err.message})`);
    }
  }

  return { count, kickedList, notInGuild, failedKick };
}

const customId = (interaction) => interaction.customId === 'kick_inactive_users';

const execute = async (interaction, client) => {
  // וידוא הרשאות מנהל לפני ביצוע הרחקה המונית
  if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '⛔ פקודה זו מיועדת למנהלים בלבד.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
      const { count, kickedList, notInGuild, failedKick } = await executeKickFailedUsers(client);

      const summaryEmbed = new EmbedBuilder()
        .setTitle('🛑 סיכום פעולת הרחקת משתמשים')
        .setDescription(`**הושלמה פעולת הרחקה ידנית.**`)
        .addFields(
            { name: `👢 הורחקו בהצלחה (${count})`, value: kickedList.length ? kickedList.join('\n').slice(0, 1024) : '—', inline: false },
            { name: `🚫 לא בשרת (סומנו כעזבו) (${notInGuild.length})`, value: notInGuild.length ? notInGuild.join('\n').slice(0, 1024) : '—', inline: false },
            { name: `⚠️ נכשלו בהרחקה (${failedKick.length})`, value: failedKick.length ? failedKick.join('\n').slice(0, 1024) : '—', inline: false }
        )
        .setColor(count > 0 ? '#FF0000' : '#FFFF00')
        .setTimestamp();

      await interaction.editReply({ embeds: [summaryEmbed] });
      
      // שליחת לוג לצוות (ללא client כפרמטר ראשון!)
      await sendStaffLog(
          '👢 ביצוע הרחקה המונית', 
          `בוצע ע"י: ${interaction.user.tag}\nהורחקו: ${count}\nנכשלו: ${failedKick.length}`, 
          0xFF0000
      );

  } catch (error) {
      console.error(error);
      await interaction.editReply({ content: '❌ שגיאה בביצוע ההרחקה.' });
  }
}

module.exports = {
  customId,
  execute
};