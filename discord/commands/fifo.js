// 📁 commands/fifo.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fifoEngine = require('../handlers/fifo/engine');
const fifoManager = require('../handlers/fifo/manager');
const { log } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('פיפו')
        .setDescription('מערכת הטורנירים החכמה של שמעון 2026')
        .addIntegerOption(opt =>
            opt.setName('כמות').setDescription('שחקנים בכל קבוצה (2, 3, 4...)').setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        // בדיקות מקדימות
        if (!voiceChannel) return interaction.editReply('❌ נכנסים לחדר קולי קודם, יא ליצן.');
        
        const members = voiceChannel.members.filter(m => !m.user.bot);
        if (members.size < 2) return interaction.editReply('❌ צריך מינימום 2 אנשים בשביל לשחק.');

        const groupSize = interaction.options.getInteger('כמות');

        try {
            // 1. לוגיקה ו-AI (ערבוב + שמות)
            const rawSquads = await fifoEngine.createSquads([...members.values()], groupSize);
            const enrichedSquads = await fifoEngine.generateMatchMetadata(interaction.guild.id, rawSquads);

            // 2. יצירת ערוצים והעברה
         const createdChannels = await fifoManager.setupChannels(interaction, enrichedSquads, voiceChannel.parentId, voiceChannel.id);
            // 3. דוח סיכום
            const summaryEmbed = new EmbedBuilder()
                .setTitle('🏆 הקרב מתחיל!')
                .setDescription(`נוצרו ${enrichedSquads.length} קבוצות. הודעה נשלחה לוואטסאפ!`)
                .setColor('#FF0000')
                .setThumbnail('https://media.giphy.com/media/l0HlCqV35hdEg2LS0/giphy.mp4')
                .setTimestamp();

            enrichedSquads.forEach(squad => {
                summaryEmbed.addFields({ 
                    name: `🛡️ ${squad.name}`, 
                    value: squad.members.map(m => `<@${m.id}>`).join('\n'), 
                    inline: true 
                });
            });

            // כפתור חזרה ללובי (Reset All)
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('fifo_return_lobby').setLabel('🚨 חזרה ללובי').setStyle(ButtonStyle.Danger)
            );

            await interaction.editReply({ embeds: [summaryEmbed], components: [row] });
            log(`[FIFO] ✅ אירוע חדש נוצר ע"י ${interaction.user.tag} (${members.size} שחקנים).`);

        } catch (error) {
            log(`❌ [FIFO] Error: ${error.message}`);
            await interaction.editReply('❌ קרתה תקלה קריטית במנוע של שמעון.');
        }
    }
};