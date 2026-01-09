// 📁 handlers/fifo/interaction.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const fifoManager = require('./manager');
const fifoEngine = require('./engine');
const { log } = require('../../utils/logger');

const FIFO_CHANNEL_ID = '1231453923387379783'; 
const DEFAULT_GROUP_SIZE = 4;

class FifoInteractionHandler {

    /**
     * טיפול בחלוקה מחדש (Repartition)
     */
    async handleRepartition(interaction) {
        log(`🔄 ${interaction.user.tag} לחץ על חלוקה מחדש`);

        const voiceChannel = interaction.guild.channels.cache.get(FIFO_CHANNEL_ID);
        if (!voiceChannel?.isVoiceBased()) {
            return interaction.reply({ content: '⛔ ערוץ הפיפו הראשי אינו זמין כרגע.', flags: MessageFlags.Ephemeral });
        }

        const members = voiceChannel.members.filter(m => !m.user.bot);
        if (members.size < 2) {
            return interaction.reply({ content: '⛔ אין מספיק שחקנים בפיפו לחלוקה מחדש.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // 1. איפוס סשן קיים
        if (fifoManager.activeSessions.has(interaction.guild.id)) {
            await fifoManager.resetSession(interaction.guild, fifoManager.activeSessions.get(interaction.guild.id));
        }

        // 2. יצירת קבוצות
        const rawSquads = await fifoEngine.createSquads([...members.values()], DEFAULT_GROUP_SIZE);
        const enrichedSquads = await fifoEngine.generateMatchMetadata(interaction.guild.id, rawSquads);

        // 3. יצירת ערוצים
        await fifoManager.setupChannels(interaction, enrichedSquads, voiceChannel.parentId, voiceChannel.id);

        // 4. דוח סיכום
        const summaryEmbed = new EmbedBuilder()
            .setTitle('📢 בוצעה חלוקה מחדש!')
            .setDescription(`נוצרו ${enrichedSquads.length} קבוצות חדשות.`)
            .setColor(0x00ff88)
            .setTimestamp();

        enrichedSquads.forEach((squad) => {
            summaryEmbed.addFields({
                name: `🛡️ ${squad.name}`,
                value: squad.members.map(m => `<@${m.id}>`).join(', '),
                inline: true
            });
        });

        await interaction.channel.send({ embeds: [summaryEmbed] });
        await interaction.editReply({ content: '✅ החלוקה מחדש בוצעה בהצלחה!' });
    }

    /**
     * טיפול בהצבעות (Replay) וחזרה ללובי
     */
    async handleVoteOrLobby(interaction) {
        const { customId } = interaction;

        // 1. כפתור חזרה ללובי
        if (customId === 'fifo_return_lobby') {
            try {
                await fifoManager.reset(interaction);
            } catch (error) {
                log(`❌ Error in reset handler: ${error.message}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: '❌ תקלה באיפוס המשחק.', ephemeral: true });
                }
            }
            return;
        }

        // 2. כפתור הצבעה ל-Replay
        if (customId.startsWith('fifo_vote_')) {
            await interaction.deferReply({ ephemeral: true });
            const teamName = customId.replace('fifo_vote_', '');

            try {
                const result = await fifoManager.handleVote(interaction, teamName);

                if (result.status === 'expired') return interaction.editReply('❌ המשחק הזה כבר לא פעיל.');
                if (result.status === 'already_voted') return interaction.editReply('⚠️ כבר הצבעת!');

                if (result.status === 'voted') {
                    await interaction.editReply(`✅ הצבעתך נקלטה! (${result.count}/${result.needed})`);

                    // רוב הושג -> ריפליי
                    if (result.passed) {
                        await interaction.channel.send(`🚨 **רוב הקבוצה הצביע לריפליי!** מחזיר את כולם ללובי...`);
                        await fifoManager.resetSession(interaction.guild, result.session);
                    }
                }
            } catch (error) {
                log(`❌ Error in vote handler: ${error.message}`);
                await interaction.editReply('❌ אירעה שגיאה בעיבוד ההצבעה.');
            }
        }
    }
}

module.exports = new FifoInteractionHandler();