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
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_stat_manual_entry').setLabel('Manual Link').setStyle(ButtonStyle.Secondary).setEmoji('🛠️'),
                    new ButtonBuilder().setCustomId('btn_plat_main').setLabel('Back').setStyle(ButtonStyle.Secondary)
                );

                const payload = {
                    content: '✅ **No Pending Stats to Review.** All clean!\n*Use the button below to manually link a gaming alias.*',
                    embeds: [], components: [row]
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

    async handleManualEntry(interaction) {
        // Must NOT defer if we want a Modal, but checking flow...
        // If we want a Modal, we must not have replied. 
        // If the button is click, we can show Modal.
        // Let's ask for the ALIAS first via Modal.

        try {
            const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

            const modal = new ModalBuilder()
                .setCustomId('modal_manual_link_alias')
                .setTitle('Manual Linking');

            const aliasInput = new TextInputBuilder()
                .setCustomId('aliasInput')
                .setLabel("What is the Gaming Alias?")
                .setPlaceholder("e.g. Ninja, Shroud...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(aliasInput);
            modal.addComponents(row);

            await interaction.showModal(modal);

        } catch (e) {
            // If interaction already deferred/replied, we can't show modal.
            // Fallback to instruction.
            const payload = { content: '❌ Cannot open form. Please use `/link [alias] @user` command instead.', ephemeral: true };
            if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
            else await interaction.reply(payload);
        }
    }

    // Called after Modal Submit -> Now ask for User
    async handleManualEntryStep2(interaction, alias) {
        const userSelect = new UserSelectMenuBuilder()
            .setCustomId(`menu_stat_manual_confirm_${alias}`)
            .setPlaceholder(`Who owns the alias '${alias}'?`)
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(userSelect);

        await interaction.reply({
            content: `🔗 **Linking Alias: '${alias}'**\nSelect the Discord User who owns this alias:`,
            components: [row],
            ephemeral: true
        });
    }

    async finalizeManualLink(interaction, alias, targetUserId) {
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 });

        try {
            const userRef = db.collection('users').doc(targetUserId);

            // Add Alias to User Identity
            await userRef.set({
                identity: {
                    aliases: admin.firestore.FieldValue.arrayUnion(alias.toLowerCase())
                }
            }, { merge: true });

            await interaction.editReply({
                content: `✅ **Success!**\nLinked alias **"${alias}"** to <@${targetUserId}>.\nFuture stats will auto-link.`
            });

        } catch (e) {
            log(`❌ [Manual Link] Error: ${e.message}`);
            interaction.editReply(`Error: ${e.message}`);
        }
    }
}

module.exports = new StatsReviewManager();
