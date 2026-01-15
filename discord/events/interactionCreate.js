// 📁 discord/events/interactionCreate.js
const { Events } = require('discord.js');
const { log } = require('../../utils/logger');
const { ensureUserExists } = require('../../utils/userUtils');
const userManager = require('../../handlers/users/manager');

// ייבוא המטפלים
const verificationHandler = require('../../handlers/users/verification');
const dashboardHandler = require('../../handlers/users/dashboard');
const birthdayHandler = require('../../handlers/birthday/interaction');
const audioHandler = require('../../handlers/audio/interaction');
const fifoHandler = require('../../handlers/fifo/interaction');
const activityMonitor = require('../../handlers/users/activity');

const VERIFIED_ROLE_ID = '1120791404583587971';

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            // --- 1. Slash Commands ---
            if (interaction.isChatInputCommand()) {
                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) return;
                try {
                    await command.execute(interaction);
                } catch (error) {
                    console.error(`Error executing ${interaction.commandName}:`, error);
                    if (!interaction.replied) await interaction.reply({ content: '❌ שגיאה בפקודה.', flags: 64 });
                }
            }

            // --- 2. Buttons & Menus ---
            else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
                const id = interaction.customId;

                // --- אימות ---
                if (id === 'verify_me_button') {
                    await interaction.deferReply({ ephemeral: true });
                    try {
                        await ensureUserExists(
                            interaction.user.id,
                            interaction.member.displayName || interaction.user.username,
                            'discord'
                        );
                        if (!interaction.member.roles.cache.has(VERIFIED_ROLE_ID)) {
                            await interaction.member.roles.add(VERIFIED_ROLE_ID);
                            await interaction.editReply({ content: '✅ **אימות הושלם!** פרטיך נשמרו בבסיס הנתונים המאוחד.' });
                            log(`[Verification] ${interaction.user.tag} אומת ונרשם ב-DB.`);
                        } else {
                            await interaction.editReply({ content: 'ℹ️ אתה כבר מאומת במערכת.' });
                        }
                    } catch (err) {
                        console.error('[Verify Error]', err);
                        await interaction.editReply({ content: '❌ שגיאה בשמירת הנתונים.' });
                    }
                }

                // --- UNIFIED DASHBOARD ROUTING ---

                // 1. Navigation & Views
                else if (id === 'btn_manage_refresh' || id === 'mng_btn_dashboard') {
                    await interaction.deferUpdate();
                    await dashboardHandler.showMainDashboard(interaction, true);
                }
                else if (id === 'btn_manage_view_link') await dashboardHandler.showLinkPanel(interaction);
                else if (id === 'btn_manage_view_debug') await dashboardHandler.showDebugPanel(interaction);

                // 2. Actions (Sync, Purge)
                else if (id === 'btn_manage_sync_names') {
                    await interaction.deferUpdate();
                    const result = await userManager.syncUnknownUsers(interaction.guild);
                    await interaction.followUp({ content: `✅ סנכרון הושלם! עודכנו **${result.count}** שמות שהיו Unknown.`, ephemeral: true });
                    await dashboardHandler.showMainDashboard(interaction, true); // Refresh UI
                }
                else if (id === 'btn_manage_purge_ghosts') await dashboardHandler.showGhostPurgeList(interaction);
                else if (id === 'btn_manage_ghost_confirm') await dashboardHandler.executeGhostPurge(interaction);

                else if (id === 'btn_manage_kick_prep') await dashboardHandler.showKickCandidateList(interaction);
                else if (id === 'btn_manage_kick_confirm' || id === 'users_kick_action') await dashboardHandler.executeKick(interaction);

                // 3. Link Logic (Menus & Telegram)
                else if (id === 'menu_manage_link_lid') await dashboardHandler.handleLinkSelection(interaction);
                else if (id.startsWith('menu_manage_link_confirm_')) await dashboardHandler.finalizeLink(interaction);

                // Telegram Logic
                else if (id === 'btn_manage_tg_link') await dashboardHandler.showTelegramMatchList(interaction);
                else if (id === 'btn_tg_force_scan') await dashboardHandler.executeTelegramForceScan(interaction);
                else if (id.startsWith('btn_tg_confirm_')) {
                    const [, , , tgId, discordId] = id.split('_');
                    await dashboardHandler.executeTelegramLink(interaction, tgId, discordId);
                }
                else if (id.startsWith('btn_tg_reject_')) {
                    // לוגיקה פשוטה להסרה מהרשימה
                    const [, , , tgId] = id.split('_');
                    const db = require('../../utils/firebase');
                    const orphanRef = db.collection('system_metadata').doc('telegram_orphans');
                    await db.runTransaction(async t => {
                        const doc = await t.get(orphanRef);
                        const data = doc.data();
                        if (data.list && data.list[tgId]) {
                            delete data.list[tgId];
                            t.set(orphanRef, data);
                        }
                    });
                    await interaction.reply({ content: '🗑️ ההתאמה נדחתה.', flags: 64 });
                    await dashboardHandler.showMainDashboard(interaction, true);
                }

                // --- Other Handlers ---
                else if (id === 'start_verification_process') await verificationHandler.showVerificationModal(interaction);
                else if (id === 'activity_iam_alive') await activityMonitor.handleAliveResponse(interaction);

                // Audio & FIFO
                else if (id === 'repartition_now') await fifoHandler.handleRepartition(interaction);
                else if (id.startsWith('fifo_')) await fifoHandler.handleVoteOrLobby(interaction);
                else if (id.startsWith('audio_')) {
                    if (id === 'audio_main_menu') await audioHandler.handleMenuSelection(interaction);
                    else if (id.startsWith('audio_play_')) await audioHandler.handleFilePlay(interaction);
                    else if (id.startsWith('audio_ctrl_')) await audioHandler.handleControls(interaction);
                }
                // Birthday
                else if (['btn_bd_set', 'btn_bd_edit', 'btn_bd_admin_panel', 'btn_bd_remind_all'].includes(id)) {
                    if (id === 'btn_bd_set' || id === 'btn_bd_edit') await birthdayHandler.showModal(interaction);
                    else if (id === 'btn_bd_admin_panel') await birthdayHandler.showAdminPanel(interaction);
                    else if (id === 'btn_bd_remind_all') await birthdayHandler.sendReminders(interaction);
                }

                // Clean close
                else if (id === 'btn_manage_cancel') await interaction.update({ content: '✅ הפעולה בוטלה.', embeds: [], components: [], files: [] });
            }

            // --- 3. Modals ---
            else if (interaction.isModalSubmit()) {
                const id = interaction.customId;
                if (id === 'modal_bd_submit') await birthdayHandler.handleModalSubmit(interaction);
                else if (id === 'verification_modal_submit') await verificationHandler.handleModalSubmit(interaction);
            }

        } catch (error) {
            log(`[Interaction Error] ${error.message}`);
        }
    }
};