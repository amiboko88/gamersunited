// 📁 discord/commands/management.js
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const dashboardHandler = require('../../handlers/users/dashboard');
const userManager = require('../../handlers/users/manager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('manage') 
        .setDescription('📊 פאנל ניהול וסינכרון המערכת')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => 
            sub.setName('panel')
               .setDescription('פתיחת דשבורד הניהול המלא (סטטיסטיקות וניקוי)'))
        .addSubcommand(sub => 
            sub.setName('sync-names')
               .setDescription('סנכרון שמות Unknown מהשרת ל-DB המאוחד')),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '⛔ אין לך הרשאות להשתמש בפקודה זו.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'panel') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await dashboardHandler.showMainDashboard(interaction);
        } 
        
        else if (sub === 'sync-names') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const result = await userManager.syncUnknownUsers(interaction.guild);
            
            if (result.success) {
                await interaction.editReply(`✅ הסנכרון הסתיים! עודכנו **${result.count}** שמות במערכת.`);
            } else {
                await interaction.editReply(`❌ שגיאה בסנכרון: ${result.message}`);
            }
        }
    }
};