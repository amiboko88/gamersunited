const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const admin = require('firebase-admin');

class StatsReviewManager {

    async showStatsReview(interaction, showDefaultReply = true) {
        if (!interaction.deferred && !interaction.replied) {
            if (showDefaultReply) await interaction.deferReply({ flags: 64 });
            else await interaction.deferUpdate();
        }

        try {
            const pendingSnap = await db.collection('pending_stats').orderBy('timestamp', 'desc').limit(5).get();

            if (pendingSnap.empty) {
                const payload = {
                    content: '✅ **No Pending Stats to Review.** All clean!',
                    embeds: [], components: []
                };
                return interaction.replied || interaction.deferred ? interaction.editReply(payload) : interaction.reply(payload);
            }

            const embeds = [];
            const rows = [];

            pendingSnap.forEach((doc, index) => {
                const data = doc.data();
                const embed = new EmbedBuilder()
                    .setTitle(`Unknown User: ${data.username}`)
                    .setDescription(`Matches found for **${data.username}** needs linking.`)
                    .addFields(
                        { name: 'Kills', value: `${data.kills}`, inline: true },
                        { name: 'Damage', value: `${data.damage}`, inline: true },
                        { name: 'Uploaded By', value: `${data.uploadedBy}`, inline: true }
                    )
                    .setColor('#FFA500'); // Orange

                if (data.proofUrl) embed.setThumbnail(data.proofUrl);

                embeds.push(embed);

                // Add Actions for this item
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`btn_stat_approve_${doc.id}`).setLabel('Link User').setStyle(ButtonStyle.Success).setEmoji('🔗'),
                    new ButtonBuilder().setCustomId(`btn_stat_delete_${doc.id}`).setLabel('Discard').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
                );
                rows.push(row);
            });

            await interaction.editReply({
                content: `**⚠️ Found ${pendingSnap.size} Pending Stats**\nReview below:`,
                embeds: embeds,
                components: rows
            });

        } catch (error) {
            log(`❌ [Stats Review] Error: ${error.message}`);
            interaction.editReply({ content: '❌ System Error loading stats.' });
        }
    }

    async handleStatsAction(interaction, action, docId) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });

        try {
            const statRef = db.collection('pending_stats').doc(docId);
            const doc = await statRef.get();

            if (!doc.exists) {
                return interaction.editReply({ content: '❌ Stat record not found (Already processed?).' });
            }

            if (action === 'delete') {
                await statRef.delete();
                await interaction.editReply({ content: '🗑️ Deleted pending stat.' });
            }
            else if (action === 'approve') {
                const userSelect = new UserSelectMenuBuilder()
                    .setCustomId(`menu_stat_link_user_${docId}`)
                    .setPlaceholder('Select the Discord User to link this score to')
                    .setMaxValues(1);

                const row = new ActionRowBuilder().addComponents(userSelect);

                await interaction.editReply({
                    content: `🔗 **Linking Stats for '${doc.data().username}'**\nSelect the user below:`,
                    components: [row]
                });
                return; // Stop here, wait for menu selection
            }

            // Refresh default view
            setTimeout(() => this.showStatsReview(interaction, false), 2000);

        } catch (e) {
            log(`❌ [Stats Action] Error: ${e.message}`);
            interaction.editReply({ content: `Error: ${e.message}` });
        }
    }

    async finalizeStatsLink(interaction, docId, targetUserId) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });

        try {
            const statRef = db.collection('pending_stats').doc(docId);
            const statDoc = await statRef.get();

            if (!statDoc.exists) return interaction.editReply('❌ Stats gone.');

            const data = statDoc.data();
            const userRef = db.collection('users').doc(targetUserId);

            // 1. Save to User Profile
            await userRef.collection('games').add({
                game: 'Warzone',
                mode: data.mode || 'Unknown',
                kills: data.kills,
                damage: data.damage,
                placement: 0,
                evidence_batch: data.evidence_batch,
                timestamp: data.timestamp,
                manual_link: true
            });

            // 2. Add Alias to User Identity (So next time it auto-links)
            await userRef.set({
                identity: {
                    aliases: admin.firestore.FieldValue.arrayUnion(data.username.toLowerCase())
                }
            }, { merge: true });

            // 3. Delete Pending
            await statRef.delete();

            await interaction.editReply(`✅ **Linked!**\nStats moved to <@${targetUserId}>.\nAdded alias "${data.username}" for future auto-detection.`);

            setTimeout(() => this.showStatsReview(interaction, false), 3000);

        } catch (e) {
            log(`❌ [Stats Link] Error: ${e.message}`);
            interaction.editReply(`Error: ${e.message}`);
        }
    }
}

module.exports = new StatsReviewManager();
