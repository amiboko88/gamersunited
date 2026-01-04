// 📁 commands/checkNewMembers.js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const dayjs = require('dayjs');
require('dayjs/plugin/relativeTime');
require('dayjs/locale/he');
dayjs.locale('he');
dayjs.extend(require('dayjs/plugin/relativeTime'));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('בדיקת_חדשים')
    .setDescription('📋 מציג את 10 המשתמשים האחרונים שהצטרפו (מתוך ה-DB המאוחד)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // ✅ תיקון קריטי: שליפה מקולקשן users במקום memberTracking
      // שימוש באינדקס על השדה המקונן tracking.joinedAt
      const snapshot = await db.collection('users')
        .orderBy('tracking.joinedAt', 'desc') 
        .limit(10)
        .get();

      if (snapshot.empty) {
        return interaction.editReply({ content: 'לא נמצאו משתמשים במערכת.', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 10 המצטרפים האחרונים (נתוני אמת)')
        .setColor('#3498db')
        .setTimestamp();
        
      const descriptionLines = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = doc.id; // ה-ID של המסמך הוא ה-DiscordID
        
        // שליפת אובייקט המעקב מתוך המבנה החדש
        const tracking = data.tracking || {};
        const identity = data.identity || {};

        // בדיקה מול דיסקורד (כדי לקבל שם עדכני אם יש)
        let displayName = identity.displayName || 'Unknown';
        try {
            const member = await interaction.guild.members.fetch(userId).catch(() => null);
            if (member) displayName = member.displayName;
        } catch (e) {}

        const joinedAt = tracking.joinedAt ? dayjs(tracking.joinedAt).fromNow() : 'לא ידוע';
        const status = tracking.status || 'active';

        // בניית השורה
        descriptionLines.push(`**${displayName}** - <@${userId}>\n> 📅 **הצטרף:** ${joinedAt}\n> 📊 **סטטוס:** \`${status}\``);
      }
      
      embed.setDescription(descriptionLines.join('\n\n'));

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('❌ שגיאה בפקודת בדיקת_חדשים:', error);
      await interaction.editReply({ content: '❌ אירעה שגיאה בשליפת הנתונים.', flags: MessageFlags.Ephemeral });
    }
  }
};