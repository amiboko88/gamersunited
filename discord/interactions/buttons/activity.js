// 📁 discord/interactions/buttons/activity.js
// ✅ תיקון נתיבים: יציאה משולשת (../../../)
const dashboardHandler = require('../../../handlers/users/dashboard');
const activityMonitor = require('../../../handlers/users/activity');
const userManager = require('../../../handlers/users/manager');
const { MessageFlags } = require('discord.js');

module.exports = {
    // תופס את כל הכפתורים והסלקטורים הקשורים לפעילות
    customId: (i) => i.customId.startsWith('users_') || i.customId === 'activity_iam_alive',

    async execute(interaction) {
        // 1. משתמש מאשר שהוא חי
        if (interaction.customId === 'activity_iam_alive') {
            await activityMonitor.handleAliveResponse(interaction);
            return;
        }

        // --- מכאן והלאה זה רק לאדמינים ---
        if (!interaction.member.permissions.has('Administrator')) return;

        // 2. כפתור הרחקה (Kick)
        if (interaction.customId === 'users_kick_action') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const stats = await userManager.getInactivityStats(interaction.guild);
            const candidates = stats.kickCandidates;
            
            if (candidates.length === 0) {
                return interaction.editReply('✅ אין משתמשים להרחקה כרגע.');
            }

            const { kicked, failed } = await userManager.kickUsers(interaction.guild, candidates);
            await interaction.editReply(`🧹 **ניקוי הושלם:**\n✅ הורחקו: ${kicked.length}\n❌ נכשלו: ${failed.length}`);
            return;
        }

        // 3. סלקטור של הדאשבורד
        if (interaction.isStringSelectMenu()) {
            await interaction.deferUpdate();
            const selection = interaction.values[0];

            if (selection === 'refresh') {
                const payload = await dashboardHandler.getDashboard(interaction);
                await interaction.editReply(payload);
            } else {
                const payload = await dashboardHandler.getListEmbed(interaction, selection);
                // שולחים כהודעה חדשה (FollowUp) כדי לא להרוס את הפאנל הראשי
                await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
            }
        }
    }
};