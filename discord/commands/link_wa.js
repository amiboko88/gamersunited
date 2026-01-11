// 📁 discord/commands/link_wa.js
const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    UserSelectMenuBuilder, 
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle 
} = require('discord.js');
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

        // שלב 1: תפריט בחירת LID
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

        const collector = response.createMessageComponentCollector({ time: 60000 });
        let selectedLid = null;

        collector.on('collect', async i => {
            // בחירת LID
            if (i.customId === 'select_lid') {
                selectedLid = i.values[0];
                
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

                // 1. ביצוע הקישור הראשוני (LID בלבד)
                const result = await matchmaker.linkUser(targetUserId, selectedLid);

                if (!result.success) {
                    await i.update({ content: `❌ שגיאה: ${result.error}`, components: [] });
                    collector.stop();
                    return;
                }

                // תרחיש א': יש מספר טלפון - סיימנו
                if (result.status === 'complete') {
                    await i.update({ 
                        content: `✅ **בוצע בהצלחה!**\nהמשתמש <@${targetUserId}> חובר ל-LID.\n📱 טלפון קיים: ${result.phone} (לא נדרס).`, 
                        components: [] 
                    });
                    collector.stop();
                } 
                // תרחיש ב': חסר מספר טלפון - פותחים טופס (Modal)
                else if (result.status === 'needs_phone') {
                    // כדי לפתוח מודל חייבים להשתמש ב-showModal כתגובה לאינטראקציה
                    // אנחנו לא יכולים לעשות update וגם showModal. 
                    // הדרך הנכונה בדיסקורד היא להציג את המודל *במקום* לעדכן את ההודעה, או למחוק ולפתוח.
                    
                    const modal = new ModalBuilder()
                        .setCustomId(`phone_modal_${targetUserId}`)
                        .setTitle('השלמת פרטי משתמש');

                    const phoneInput = new TextInputBuilder()
                        .setCustomId('phone_number')
                        .setLabel("הזן מספר טלפון (05X-XXXXXXX)")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('0541234567');

                    const firstActionRow = new ActionRowBuilder().addComponents(phoneInput);
                    modal.addComponents(firstActionRow);

                    await i.showModal(modal);
                    
                    // מאזינים להגשת הטופס
                    try {
                        const submitted = await i.awaitModalSubmit({ time: 60000, filter: m => m.customId === `phone_modal_${targetUserId}` });
                        const phone = submitted.fields.getTextInputValue('phone_number');
                        
                        // עדכון המספר ב-DB
                        const updateRes = await matchmaker.updateUserPhone(targetUserId, phone);
                        
                        if (updateRes.success) {
                            await submitted.reply({ content: `✅ **תהליך הושלם!**\n<@${targetUserId}> קושר ל-LID ועודכן עם הטלפון: ${updateRes.phone}.`, ephemeral: true });
                        } else {
                            await submitted.reply({ content: `⚠️ ה-LID קושר, אך הייתה שגיאה בשמירת הטלפון: ${updateRes.error}`, ephemeral: true });
                        }
                    } catch (err) {
                        // אם לא הגישו בזמן
                         console.log("Modal timed out or error", err);
                    }
                    collector.stop();
                }
            }
        });
    }
};