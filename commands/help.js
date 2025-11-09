// 📁 commands/help.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');

// שימוש בגנרטור התמונות הקיים
const generateHelpImage = require('../handlers/generateHelpImage'); 

const USER_IMAGE_NAME = 'helpUser'; 
const ADMIN_IMAGE_NAME = 'helpAdmin'; 
const OUTPUT_DIR = path.resolve(__dirname, '..', 'images');

/**
 * פונקציית עזר להשגת/יצירת התמונה (כמו ב-help_panel.js)
 */
async function getHelpImage(imageName) {
    const imagePath = path.join(OUTPUT_DIR, `${imageName}.png`);
    
    try {
        await generateHelpImage(imageName); // ייצור התמונה אם חסרה או ישנה
    } catch (err) {
        console.error(`❌ שגיאה בייצור תמונת עזרה ${imageName}:`, err.message);
        const fallback = path.join(OUTPUT_DIR, 'helpUser.png');
        if (fs.existsSync(fallback)) return fallback;
        throw new Error(`לא קיימת תמונת עזרה ${imageName}.png ולא ניתן לייצר אחת.`);
    }
    return imagePath;
}

/**
 * בונה את כפתורי הפאנל ההתחלתיים
 */
function buildInitialButtons(isAdmin) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_admin_panel') // ID למעבר לפאנל מנהל
            .setLabel('👑 פקודות מנהל')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!isAdmin), // חסום למשתמשים רגילים
        new ButtonBuilder()
            .setCustomId('help_ai_modal_button') // ID לפתיחת מודאל AI
            .setLabel('🤖 שאל את שמעון')
            .setStyle(ButtonStyle.Success)
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('עזרה')
        .setDescription('מציג את כל הפקודות הזמינות בשרת'),

    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // תמיד מציג את תמונת המשתמש הרגילה בהתחלה
            const imagePath = await getHelpImage(USER_IMAGE_NAME);
            const attachment = new AttachmentBuilder(imagePath);
            const buttons = buildInitialButtons(isAdmin);

            await interaction.editReply({
                content: null, 
                files: [attachment],
                components: [buttons],
            });

        } catch (error) {
            console.error("❌ שגיאה בפקודת /עזרה:", error);
            await interaction.editReply({ content: '❌ אירעה שגיאה בטעינת פאנל העזרה.', flags: MessageFlags.Ephemeral });
        }
    },
    
    // הפונקציות הישנות (handleButton) נמחקו כדי למנוע כפילויות, 
    // והלוגיקה שלהן הועברה ל-help_panel.js ול-help_ai_modal.js
};