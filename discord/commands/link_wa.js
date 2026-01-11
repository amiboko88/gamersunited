// 📁 discord/commands/link_wa.js
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const matchmaker = require('../../handlers/matchmaker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link_wa')
        .setDescription('🔗 קישור ידני של משתמשי וואטסאפ (LID) למשתמשי דיסקורד')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const orphans = matchmaker.getOrphans();

        if (orphans.length === 0) {
            return interaction.reply({ content: '✅ הכל נקי. אין משתמשים לא מזוהים כרגע.', ephemeral: true });
        }

        // שלב 1: בחירת ה-LID מהרשימה
        // Discord מגביל ל-25 אפשרויות בתפריט
        const options = orphans.slice(0, 25).map(o => ({
            label: `${o.name} (${o.lid.substring(0, 5)}...)`,
            description: `הודעה: ${o.lastMsg}`,
            value: o.lid
        }));

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_lid')
                    .setPlaceholder('בחר את המשתמש מוואטסאפ...')
                    .addOptions(options)
            );

        const response = await interaction.reply({
            content: `🔎 **נמצאו ${orphans.length} משתמשים לא מקושרים.**\nבחר את מי אתה רוצה לחבר:`,
            components: [row],
            ephemeral: true
        });

        // יצירת קולקטור לאירועים של התפריטים
        const collector = response.createMessageComponentCollector({ time: 60000 });
        
        // משתנה לשמירת ה-LID שנבחר (זמני לריצה הזו)
        let selectedLid = null;

        collector.on('collect', async i => {
            // בחירת LID
            if (i.customId === 'select_lid') {
                selectedLid = i.values[0];
                
                // יצירת תפריט בחירת משתמש דיסקורד (UserSelectMenuBuilder ✅)
                const userSelectRow = new ActionRowBuilder()
                    .addComponents(
                        new UserSelectMenuBuilder()
                            .setCustomId('select_discord_user')
                            .setPlaceholder('בחר את המשתמש בדיסקורד')
                    );

                await i.update({
                    content: `🔗 בחרת את LID: \`${selectedLid}\`.\nעכשיו בחר לאיזה משתמש דיסקורד לחבר אותו:`,
                    components: [userSelectRow]
                });
            }
            
            // בחירת משתמש דיסקורד וביצוע הקישור
            else if (i.customId === 'select_discord_user') {
                const targetUserId = i.values[0];
                
                if (!selectedLid) {
                    return i.update({ content: '❌ שגיאה: נא לבחור קודם LID.', components: [] });
                }

                const result = await matchmaker.linkUser(targetUserId, selectedLid);

                if (result.success) {
                    await i.update({ 
                        content: `✅ **בוצע בהצלחה!**\nהמשתמש מוואטסאפ (\`${selectedLid}\`) חובר למשתמש הדיסקורד <@${targetUserId}>.\nמעכשיו שמעון יזהה אותו.`, 
                        components: [] 
                    });
                } else {
                    await i.update({ content: `❌ שגיאה בביצוע הקישור: ${result.error}`, components: [] });
                }
                
                collector.stop();
            }
        });
    }
};