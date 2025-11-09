// 📁 commands/help.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
// ✅ [שדרוג] שימוש בגנרטור הקיים מבוסס Puppeteer
const generateHelpImage = require('../handlers/generateHelpImage'); 

const USER_IMAGE_NAME = 'helpUser'; // שם ללא סיומת
const ADMIN_IMAGE_NAME = 'helpAdmin';
// ✅ [שדרוג] שימוש בנתיב הפלט שהוגדר ב-generateHelpImage.js
const OUTPUT_DIR = path.resolve(__dirname, '..', 'images');

/**
 * פונקציית עזר להשגת/יצירת התמונה
 */
async function getHelpImage(imageName) {
    const imagePath = path.join(OUTPUT_DIR, `${imageName}.png`);
    
    // הגנרטור שלך כולל לוגיקת cache, אז זה בסדר לקרוא לו.
    // הוא ייצר תמונה רק אם היא חסרה או ישנה מדי.
    try {
        // 'imageName' כאן הוא 'helpUser' או 'helpAdmin'
        await generateHelpImage(imageName); 
    } catch (err) {
        console.error(`❌ שגיאה בייצור תמונת עזרה ${imageName}:`, err.message);
        // Fallback אם הייצור נכשל (למשל, קובץ HTML חסר)
        const fallback = path.join(OUTPUT_DIR, 'helpUser.png'); 
        if (fs.existsSync(fallback)) return fallback;
        else throw new Error(`לא קיימת תמונת עזרה ${imageName}.png ולא ניתן לייצר אחת.`);
    }
    
    return imagePath;
}

/**
 * בונה את שורת הכפתורים הראשית
 */
function buildInitialButtons(isAdmin) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_admin_panel')
            .setLabel('👑 פקודות מנהל')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!isAdmin), // ✅ חסום למשתמשים רגילים
        new ButtonBuilder()
            .setCustomId('help_ai_modal_button') // ✅ ID ברור יותר לכפתור
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
                content: null, // ✅ אין יותר טקסט מעל התמונה
                files: [attachment],
                components: [buttons],
            });

        } catch (error) {
            console.error("❌ שגיאה בפקודת /עזרה:", error);
            await interaction.editReply({ content: 'אירעה שגיאה בהצגת העזרה. ייתכן שתבניות ה-HTML חסרות או שגויות.', flags: MessageFlags.Ephemeral });
        }
    },
};