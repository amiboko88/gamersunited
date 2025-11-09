// 📁 interactions/help_panel.js (מחליף את help_buttons.js)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const generateHelpImage = require('../handlers/generateHelpImage'); // ✅ שימוש באותו גנרטור

const USER_IMAGE_NAME = 'helpUser';
const ADMIN_IMAGE_NAME = 'helpAdmin';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'images'); // לפי הגדרות הגנרטור

// פונקציית עזר זהה לזו שבפקודה הראשית
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
    customId: (interaction) => {
        return interaction.isButton() && (interaction.customId === 'help_admin_panel' || interaction.customId === 'help_user_panel');
    },

    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        
        if (interaction.customId === 'help_admin_panel' && !isAdmin) {
            return interaction.reply({ content: '⛔ אין לך הרשאות לפעולה זו.', flags: MessageFlags.Ephemeral });
        }
        
        await interaction.deferUpdate();

        let targetImageName;
        let newButtons;

        if (interaction.customId === 'help_admin_panel') {
            // --- הצג פאנל מנהל ---
            targetImageName = ADMIN_IMAGE_NAME;
            newButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('help_user_panel') // ✅ כפתור חזרה למשתמש
                    .setLabel('👤 פקודות משתמש')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('help_ai_modal_button') // ID אחיד
                    .setLabel('🤖 שאל את שמעון')
                    .setStyle(ButtonStyle.Success)
            );
        } else {
            // --- הצג פאנל משתמש (חזרה) ---
            targetImageName = USER_IMAGE_NAME;
            newButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('help_admin_panel')
                    .setLabel('👑 פקודות מנהל')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!isAdmin),
                new ButtonBuilder()
                    .setCustomId('help_ai_modal_button') // ID אחיד
                    .setLabel('🤖 שאל את שמעון')
                    .setStyle(ButtonStyle.Success)
            );
        }

        const imagePath = await getHelpImage(targetImageName);
        const attachment = new AttachmentBuilder(imagePath);

        await interaction.editReply({
            content: null,
            files: [attachment],
            components: [newButtons]
        });
    }
};