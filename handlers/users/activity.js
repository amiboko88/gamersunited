// 📁 handlers/users/activity.js
const cron = require('node-cron');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const { sendStaffLog } = require('../../utils/staffLogger');

const WARNING_DAYS = 7;
const KICK_DAYS = 30;

class ActivityMonitor {
    init(client) {
        this.client = client;
        cron.schedule('0 19 * * *', () => this.runDailyScan());
    }

    async runDailyScan() {
        const guild = this.client.guilds.cache.first();
        if (!guild) return;
        const now = Date.now();
        const snapshot = await db.collection('users').get();

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const userId = doc.id;
            if (data.tracking?.statusStage === 'failed_dm') continue;
            
            const lastActiveStr = data.meta?.lastActive || data.tracking?.joinedAt;
            if (!lastActiveStr) continue;
            const days = Math.floor((now - new Date(lastActiveStr).getTime()) / (1000 * 60 * 60 * 24));

            if (days >= WARNING_DAYS && days < KICK_DAYS && data.tracking?.statusStage !== 'warning_sent') {
                await this.sendDM(userId, days, 'warning');
            } else if (days >= KICK_DAYS && data.tracking?.statusStage !== 'final_warning') {
                await this.sendDM(userId, days, 'final');
            }
        }
    }

    async sendDM(userId, days, type) {
        try {
            const user = await this.client.users.fetch(userId);
            const isFinal = type === 'final';
            const embed = new EmbedBuilder()
                .setTitle(isFinal ? '🚨 התראה אחרונה' : '👋 היי, נעלמת!')
                .setDescription(`לא היית פעיל ${days} ימים. ${isFinal ? 'אתה ברשימת ההרחקה.' : 'הכל בסדר?'}`)
                .setColor(isFinal ? 'Red' : 'Yellow');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('activity_iam_alive').setLabel('אני חי!').setStyle(ButtonStyle.Success)
            );
            await user.send({ embeds: [embed], components: [row] });
            await db.collection('users').doc(userId).update({ 'tracking.statusStage': isFinal ? 'final_warning' : 'warning_sent' });
        } catch (e) {
            await db.collection('users').doc(userId).update({ 'tracking.statusStage': 'failed_dm' });
        }
    }

    async handleAliveResponse(interaction) {
        await interaction.deferUpdate();
        const userId = interaction.user.id;
        await db.collection('users').doc(userId).update({
            'meta.lastActive': new Date().toISOString(),
            'tracking.statusStage': 'active'
        });
        await interaction.followUp({ content: '✅ עודכנת כפעיל.', flags: 64 });
    }
}
module.exports = new ActivityMonitor();