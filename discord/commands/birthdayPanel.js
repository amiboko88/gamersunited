// 📁 commands/birthdayPanel.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
// אין לוגיקה כאן! רק תצוגה
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ניהול_ימיהולדת')
    .setDescription('🎉 פאנל ניהול ימי הולדת')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // עיצוב נקי
    const embed = new EmbedBuilder()
      .setTitle('🎂 מערכת ימי הולדת')
      .setDescription('לחץ למטה כדי להגדיר את תאריך הלידה שלך.\nהמערכת תדע לחגוג לך בכל הפלטפורמות!')
      .setColor('#FF007F');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('open_birthday_modal') // ID שנתפס ב-interactionHandler
            .setLabel('📅 הגדר יום הולדת')
            .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  }
};