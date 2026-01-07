// 📁 handlers/users/activity.js
const cron = require('node-cron');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../utils/firebase');
// ✅ עכשיו הם יהיו בשימוש ולכן הצבע יחזור לחיים
const { log } = require('../../utils/logger'); 
const { sendStaffLog } = require('../../utils/logger'); 

const WARNING_DAYS = 7;
const KICK_DAYS = 30;

class ActivityMonitor {
    init(client) {
        this.client = client;
        // בדיקה יומית ב-19:00
        cron.schedule('0 19 * * *', () => this.runDailyScan());
    }

    async runDailyScan() {
        const guild = this.client.guilds.cache.first();
        if (!guild) return;
        
        log('[Activity] מתחיל סריקת פעילות יומית...'); // ✅ שימוש בלוגר

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
            
            // עדכון DB
            await db.collection('users').doc(userId).update({ 
                'tracking.statusStage': isFinal ? 'final_warning' : 'warning_sent' 
            });

            // ✅ דיווח לוגים (השימוש שחסר קודם)
            log(`[Activity] נשלחה התראה (${type}) למשתמש ${user.tag} עקב ${days} ימי היעדרות.`);
            
            // ✅ דיווח לצוות (Staff Log)
            if (this.client) {
                sendStaffLog(this.client, 
                    isFinal ? '🚨 התראה לפני הרחקה' : '⚠️ התראת אי-פעילות', 
                    `**משתמש:** ${user} (${user.tag})\n**ימים:** ${days}\n**סטטוס:** נשלחה הודעה פרטית.`,
                    isFinal ? 'Red' : 'Orange'
                );
            }

        } catch (e) {
            log(`❌ [Activity] שגיאה בשליחת DM ל-${userId}: ${e.message}`);
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
        
        log(`✅ [Activity] המשתמש ${interaction.user.tag} סימן שהוא חי.`);
        await interaction.followUp({ content: '✅ עודכנת כפעיל.', flags: 64 });
    }
}

module.exports = new ActivityMonitor();