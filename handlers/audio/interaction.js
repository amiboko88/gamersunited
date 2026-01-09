// 📁 handlers/audio/interaction.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const scanner = require('./scanner');
const manager = require('./manager');

// ניהול ספאם
const userCooldowns = new Map();
const COOLDOWN_SECONDS = 2; // זמן המתנה קצר

class AudioInteractionHandler {

    // ... (פונקציית showConsole נשארת זהה) ...
    async showConsole(interaction) {
        // (הקוד של התפריט הראשי נשאר אותו דבר כמו ששלחתי קודם)
        // אני מקצר כאן כדי לחסוך מקום, תעתיק את showConsole מהגרסה הקודמת
        // או שאשלח לך שוב אם תבקש. העיקר נמצא למטה ב-handleFilePlay.
         const embed = new EmbedBuilder()
            .setTitle('🎧 Shimon DJ Console')
            .setDescription('מערכת הסאונד המרכזית.\nבחר קטגוריה כדי לטעון קבצים.')
            .setColor('#2b2d31')
            .addFields(
                { name: '🎵 נגן כעת', value: manager.currentTrack ? `**${manager.currentTrack.name}**` : 'שקט...', inline: true },
                { name: '🎚️ סטטוס', value: manager.connection ? 'מחובר 🟢' : 'מנותק 🔴', inline: true }
            );

        const menu = new StringSelectMenuBuilder()
            .setCustomId('audio_main_menu')
            .setPlaceholder('בחר ספרייה...')
            .addOptions([
                { label: 'מוזיקה (Tracks)', description: 'שירים מלאים', value: 'mode_tracks', emoji: '🎵' },
                { label: 'סאונדבורד (Effects)', description: 'אפקטים קצרים', value: 'mode_effects', emoji: '📣' },
                { label: 'עצור הכל והתנתק', value: 'mode_stop', emoji: '🛑' }
            ]);

        const controls = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('audio_ctrl_pause').setEmoji('⏯️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('audio_ctrl_loop').setEmoji('🔁').setStyle(manager.isLooping ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('audio_ctrl_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ 
            embeds: [embed], 
            components: [new ActionRowBuilder().addComponents(menu), controls],
            ephemeral: false 
        });
    }

    async handleMenuSelection(interaction) {
        // טיפול בבחירה מהתפריט (כמו קודם)
        const selection = interaction.values[0];

        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ כנס קודם לערוץ קול!', ephemeral: true });
        }
        await manager.joinChannel(interaction.member.voice.channel);

        if (selection === 'mode_stop') {
            manager.stop();
            // כאן נשתמש ב-update כדי לסגור את התפריט יפה
            return interaction.update({ content: '🛑 הנגן נעצר והתנתק.', embeds: [], components: [] });
        }

        let files = [];
        let type = '';
        
        if (selection === 'mode_tracks') {
            files = scanner.getTracks();
            type = 'track';
        } else {
            files = scanner.getEffects();
            type = 'effect';
        }

        if (files.length === 0) {
            return interaction.reply({ content: '❌ התיקייה ריקה.', ephemeral: true });
        }

        const fileOptions = files.slice(0, 25).map(f => ({
            label: f.name.substring(0, 99),
            value: f.filename,
            emoji: type === 'track' ? '💿' : '🔊'
        }));

        const fileMenu = new StringSelectMenuBuilder()
            .setCustomId(`audio_play_${type}`)
            .setPlaceholder(`בחר ${type === 'track' ? 'שיר' : 'אפקט'}...`)
            .addOptions(fileOptions);

        // שולחים הודעה חדשה (Ephemeral) עם הרשימה, כדי לא לדרוס את הפאנל הראשי
        await interaction.reply({
            content: `📂 **בחר מה לנגן:**`,
            components: [new ActionRowBuilder().addComponents(fileMenu)],
            ephemeral: true
        });
    }

    /**
     * ✅ התיקון הגדול: שימוש ב-deferUpdate
     * זה מונע את הקפיצה של "Only you can see this" ומשאיר את התפריט פתוח
     */
    async handleFilePlay(interaction) {
        // בדיקת Cooldown
        const userId = interaction.user.id;
        const now = Date.now();
        const lastPress = userCooldowns.get(userId) || 0;

        if (now - lastPress < COOLDOWN_SECONDS * 1000) {
            // במקרה של ספאם, אנחנו חייבים להגיב, אז נשתמש ב-reply שקט
            return interaction.reply({ content: '⏳ חכה רגע...', ephemeral: true });
        }
        userCooldowns.set(userId, now);

        // --- התיקון: אנחנו "בולעים" את הלחיצה בלי להקפיץ הודעה ---
        await interaction.deferUpdate(); 

        const filename = interaction.values[0];
        const type = interaction.customId.includes('track') ? 'track' : 'effect';
        const list = type === 'track' ? scanner.getTracks() : scanner.getEffects();
        const fileObj = list.find(f => f.filename === filename);

        if (fileObj) {
            if (type === 'track') {
                await manager.playTrack(fileObj.path, fileObj.name);
                // אופציונלי: אפשר לערוך את ההודעה המקורית (editReply) כדי להראות מה מתנגן
                // אבל אם אנחנו רוצים חוויה חלקה של "לחץ ונגן", עדיף לא לגעת.
            } else {
                await manager.playEffect(fileObj.path);
            }
        }
    }

    async handleControls(interaction) {
        // גם בכפתורי השליטה נשתמש ב-deferUpdate לחוויה חלקה
        await interaction.deferUpdate();
        
        const action = interaction.customId.replace('audio_ctrl_', '');
        if (action === 'stop') manager.stop();
        else if (action === 'pause') manager.togglePause();
        else if (action === 'loop') manager.isLooping = !manager.isLooping;
        
        // כאן אפשר לעדכן את הכפתורים (למשל לשנות את כפתור הלופ לירוק)
        // ע"י interaction.editReply({ components: ... })
        // אבל זה דורש לבנות מחדש את ה-Embed. לשיקולך.
    }
}

module.exports = new AudioInteractionHandler();