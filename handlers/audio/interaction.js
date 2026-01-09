// 📁 handlers/audio/interaction.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const scanner = require('./scanner');
const manager = require('./manager');

// ניהול ספאם
const userCooldowns = new Map();
const COOLDOWN_SECONDS = 3; // זמן המתנה בין לחיצות

class AudioInteractionHandler {

    /**
     * פתיחת הקונסולה הראשית (נקרא מהפקודה /dj)
     */
    async showConsole(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎧 Shimon DJ Console')
            .setDescription('מערכת הסאונד המרכזית.\nבחר קטגוריה כדי לטעון קבצים.')
            .setColor('#2b2d31')
            .setImage('https://media1.tenor.com/m/zNmd9nLLAlQAAAAd/cat-gato.gif')
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

    /**
     * טיפול בבחירה מהתפריט הראשי
     */
    async handleMenuSelection(interaction) {
        const selection = interaction.values[0];

        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '❌ אתה חייב להיות בערוץ קול!', ephemeral: true });
        }
        await manager.joinChannel(interaction.member.voice.channel);

        if (selection === 'mode_stop') {
            manager.stop();
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
            return interaction.reply({ content: '❌ התיקייה ריקה. גרור לשם קבצים!', ephemeral: true });
        }

        const fileOptions = files.slice(0, 25).map(f => ({
            label: f.name.substring(0, 99),
            value: f.filename,
            emoji: type === 'track' ? '💿' : '🔊'
        }));

        const fileMenu = new StringSelectMenuBuilder()
            .setCustomId(`audio_play_${type}`)
            .setPlaceholder(`בחר ${type === 'track' ? 'שיר' : 'אפקט'} לניגון...`)
            .addOptions(fileOptions);

        await interaction.reply({
            content: `📂 **ספריית ${type === 'track' ? 'מוזיקה' : 'אפקטים'}**`,
            components: [new ActionRowBuilder().addComponents(fileMenu)],
            ephemeral: true
        });
    }

    /**
     * טיפול בניגון קובץ (עם Cooldown)
     */
    async handleFilePlay(interaction) {
        // --- בדיקת Cooldown ---
        const userId = interaction.user.id;
        const now = Date.now();
        const lastPress = userCooldowns.get(userId) || 0;

        if (now - lastPress < COOLDOWN_SECONDS * 1000) {
            return interaction.reply({ content: '⏳ תן אוויר, חכה כמה שניות.', ephemeral: true });
        }
        userCooldowns.set(userId, now);
        // ---------------------

        const filename = interaction.values[0];
        const type = interaction.customId.includes('track') ? 'track' : 'effect';
        
        const list = type === 'track' ? scanner.getTracks() : scanner.getEffects();
        const fileObj = list.find(f => f.filename === filename);

        if (!fileObj) return interaction.reply({ content: '❌ שגיאה: הקובץ לא נמצא.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        if (type === 'track') {
            await manager.playTrack(fileObj.path, fileObj.name);
            await interaction.editReply(`🎵 מנגן כעת: **${fileObj.name}**`);
        } else {
            await manager.playEffect(fileObj.path);
            await interaction.editReply(`📣 אפקט: **${fileObj.name}**`);
        }
    }

    async handleControls(interaction) {
        const action = interaction.customId.replace('audio_ctrl_', '');
        
        if (action === 'stop') {
            manager.stop();
            await interaction.reply({ content: '⏹️ עצרתי.', ephemeral: true });
        } else if (action === 'pause') {
            const status = manager.togglePause();
            await interaction.reply({ content: status === 'paused' ? '⏸️ הושהה' : '▶️ ממשיך', ephemeral: true });
        } else if (action === 'loop') {
            manager.isLooping = !manager.isLooping;
            await interaction.reply({ content: manager.isLooping ? '🔁 לופ מופעל' : '➡️ לופ כבוי', ephemeral: true });
        }
    }
}

module.exports = new AudioInteractionHandler();