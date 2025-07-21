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
    .setDescription('📋 מציג את 10 המשתמשים האחרונים שנוספו למערכת המעקב')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const snapshot = await db.collection('memberTracking')
        .orderBy('joinedAt', 'desc')
        .limit(10)
        .get();

      if (snapshot.empty) {
        return interaction.editReply({ content: 'לא נמצאו משתמשים במערכת המעקב.', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 10 המצטרפים האחרונים למערכת המעקב')
        .setColor('#3498db')
        .setTimestamp();
        
      const descriptionLines = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = doc.id;
        const member = await interaction.guild.members.fetch(userId).catch(() => null);

        const displayName = member ? member.displayName : `(עזב) ${userId}`;
        const joinedAt = data.joinedAt ? dayjs(data.joinedAt).fromNow() : 'לא ידוע';
        const status = data.statusStage || 'הצטרף';

        descriptionLines.push(`**${displayName}** - <@${userId}>\n> 📅 **הצטרף:** ${joinedAt}\n> 📊 **סטטוס:** \`${status}\``);
      }
      
      embed.setDescription(descriptionLines.join('\n\n'));

      await interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    } catch (error) {
      console.error('❌ שגיאה בפקודת /בדיקת_חדשים:', error);
      await interaction.editReply({ content: 'אירעה שגיאה בשליפת הנתונים מבסיס הנתונים.', flags: MessageFlags.Ephemeral });
    }
  }
};