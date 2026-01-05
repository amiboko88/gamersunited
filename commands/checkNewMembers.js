// 📁 commands/checkNewMembers.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const dayjs = require('dayjs');
require('dayjs/plugin/relativeTime');
require('dayjs/locale/he');
dayjs.locale('he');
dayjs.extend(require('dayjs/plugin/relativeTime'));

// תאריך המיגרציה שיש להתעלם ממנו (כפי שראיתי ב-DB שלך)
const MIGRATION_DATE_PREFIX = '2026-01-02';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('בדיקת_חדשים')
    .setDescription('📋 מציג את 10 המשתמשים האחרונים שהצטרפו (תיקון אוטומטי לנתוני מיגרציה)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // 1. שליפת כל המשתמשים (בגלל שהמיון ב-DB שגוי כרגע, נמשוך ונסדר ידנית)
      // זה בסדר ב-Scale הנוכחי. בעתיד יהיה שדה מתוקן.
      const snapshot = await db.collection('users').get();
      
      if (snapshot.empty) {
        return interaction.editReply({ content: 'לא נמצאו משתמשים במערכת.', flags: MessageFlags.Ephemeral });
      }

      let membersList = [];

      // 2. מעבר על המשתמשים ואיסוף נתונים (כולל שליפה מדיסקורד לתיקון תאריך)
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = doc.id;
        let joinedAtRaw = data.tracking?.joinedAt;
        let isRealDate = true;

        // בדיקה אם זה תאריך המיגרציה (המלוכלך)
        if (joinedAtRaw && typeof joinedAtRaw === 'string' && joinedAtRaw.startsWith(MIGRATION_DATE_PREFIX)) {
            isRealDate = false;
        }

        let discordMember = null;
        
        // אם התאריך חשוד כלא נכון, או חסר שם, נמשוך מדיסקורד
        if (!isRealDate || !data.identity?.displayName || data.identity?.displayName === 'Unknown') {
             try {
                discordMember = await interaction.guild.members.fetch(userId).catch(() => null);
                if (discordMember) {
                    // תיקון התאריך לפי דיסקורד
                    joinedAtRaw = discordMember.joinedAt.toISOString();
                    
                    // אופציונלי: עדכון ה-DB ברקע (Self Healing)
                    /* doc.ref.update({ 
                        'tracking.joinedAt': joinedAtRaw,
                        'identity.displayName': discordMember.displayName
                    }).catch(console.error); */
                }
             } catch (e) {}
        }

        if (joinedAtRaw) {
            membersList.push({
                userId,
                displayName: discordMember?.displayName || data.identity?.displayName || 'Unknown',
                joinedAt: new Date(joinedAtRaw),
                status: data.tracking?.status || 'active'
            });
        }
      }

      // 3. מיון לפי תאריך (מהחדש לישן)
      membersList.sort((a, b) => b.joinedAt - a.joinedAt);

      // 4. לקיחת ה-10 האחרונים
      const top10 = membersList.slice(0, 10);

      const embed = new EmbedBuilder()
        .setTitle('📋 10 המצטרפים האחרונים (לאחר סינון)')
        .setColor('#3498db')
        .setTimestamp();
        
      const descriptionLines = top10.map(m => {
          const timeString = dayjs(m.joinedAt).fromNow();
          return `**${m.displayName}** - <@${m.userId}>\n> 📅 **הצטרף:** ${timeString} (${dayjs(m.joinedAt).format('DD/MM/YY')})\n> 📊 **סטטוס:** \`${m.status}\``;
      });
      
      embed.setDescription(descriptionLines.length > 0 ? descriptionLines.join('\n\n') : 'לא נמצאו נתונים.');

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('❌ שגיאה בפקודת בדיקת_חדשים:', error);
      await interaction.editReply({ content: '❌ אירעה שגיאה בשליפת הנתונים.', flags: MessageFlags.Ephemeral });
    }
  }
};