// 📁 interactions/help_panel.js (מטפל בכפתורי מעבר פאנל)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const generateHelpImage = require('../handlers/generateHelpImage');

const USER_IMAGE_NAME = 'helpUser';
const ADMIN_IMAGE_NAME = 'helpAdmin';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'images');

/**
 * פונקציית עזר להשגת/יצירת התמונה (כמו בפקודה הראשית)
 */
async function getHelpImage(imageName) {
    const imagePath = path.join(OUTPUT_DIR, `${imageName}.png`);
    try {
        await generateHelpImage(imageName);
    } catch (err) {
        console.error(`❌ שגיאה בייצור תמונת עזרה ${imageName}:`, err.message);
        const fallback = path.join(OUTPUT_DIR, 'helpUser.png');
        if (fs.existsSync(fallback)) return fallback;
        else throw new Error(`לא קיימת תמונת עזרה ${imageName}.png ולא ניתן לייצר אחת.`);
    }
    return imagePath;
}

module.exports = {
    // מזהה את שני כפתורי המעבר בין פאנלים
    customId: (interaction) => {
        return interaction.isButton() && (interaction.customId === 'help_admin_panel' || interaction.customId === 'help_user_panel');
    },

    async execute(interaction) {
        await interaction.deferUpdate(); // מעדכן את האינטראקציה

        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        let targetImageName;
        let newButtons;

        if (interaction.customId === 'help_admin_panel') {
            // --- הצג פאנל מנהל ---
            targetImageName = ADMIN_IMAGE_NAME;
            newButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('help_user_panel') // כפתור חזרה למשתמש
                    .setLabel('👤 פקודות משתמש')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('help_ai_modal_button') // כפתור AI
                    .setLabel('🤖 שאל את שמעון')
                    .setStyle(ButtonStyle.Success)
            );
        } else {
            // --- הצג פאנל משתמש (כולל חזרה) ---
            targetImageName = USER_IMAGE_NAME;
            newButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('help_admin_panel')
                    .setLabel('👑 פקודות מנהל')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!isAdmin),
                new ButtonBuilder()
                    .setCustomId('help_ai_modal_button')
                    .setLabel('🤖 שאל את שמעון')
                    .setStyle(ButtonStyle.Success)
            );
        }

        const imagePath = await getHelpImage(targetImageName);
        const attachment = new AttachmentBuilder(imagePath);

        // עריכת ההודעה הקיימת עם התמונה והכפתורים החדשים
        await interaction.editReply({
            content: null,
            files: [attachment],
            components: [newButtons]
        });
    }
};