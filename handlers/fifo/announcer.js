// 📁 handlers/fifo/announcer.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

// הגדרות קבועות (אפשר להעביר ל-ENV אם תרצה)
const CONFIG = {
    TARGET_CHANNEL: '1372283521447497759', // איפה מכריזים
    SOURCE_CHANNEL: '1231453923387379783', // על איזה ערוץ קול מסתכלים
    KEYWORDS: ['warzone', 'call of duty', 'black ops', 'mw3', 'bo6']
};

class WarzoneAnnouncer {

    /**
     * בודק אם יש אקשן בחדר ומעדכן את ההכרזה
     */
    async checkAndAnnounce(client) {
        try {
            const channel = await client.channels.fetch(CONFIG.SOURCE_CHANNEL).catch(() => null);
            if (!channel || channel.members.size === 0) return;

            // סינון שחקני Warzone
            const warriors = channel.members.filter(m => this.isPlayingWarzone(m.presence));
            
            // אם אין לוחמים, לא עושים כלום (או מוחקים הודעה קודמת אם רוצים)
            if (warriors.size === 0) return;

            const targetChannel = await client.channels.fetch(CONFIG.TARGET_CHANNEL).catch(() => null);
            if (!targetChannel) return;

            // מחיקת הודעה קודמת (כדי לא להספים)
            await this.deletePreviousMessage(targetChannel);

            // יצירת ההודעה החדשה
            const gameName = this.getGameName(warriors.first()?.presence);
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000') // אדום קרבי
                .setTitle('🚨 Warzone Squad Active!')
                .setDescription(`🕒 **עכשיו בחדר:** ${gameName}`)
                .setThumbnail('https://media.giphy.com/media/dZ3nw7fLzcZvf5jDzw/giphy.gif')
                .addFields(
                    { name: `🔥 לוחמים (${warriors.size})`, value: warriors.map(m => `• ${m.displayName}`).join('\n'), inline: true },
                    { name: '🛑 חסרי מעש', value: channel.members.filter(m => !this.isPlayingWarzone(m.presence)).map(m => m.displayName).join(', ') || 'אין', inline: true }
                )
                .setFooter({ text: 'הצטרפו לקרב או שתמשיכו לישון' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('הצטרף ללובי')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/channels/${channel.guild.id}/${channel.id}`)
            );

            const msg = await targetChannel.send({ embeds: [embed], components: [row] });
            
            // שמירת ID למחיקה הבאה
            await db.collection('system_metadata').doc('fifo_warzone').set({ lastAnnouncementId: msg.id });

        } catch (error) {
            log(`❌ [Announcer] Error: ${error.message}`);
        }
    }

    isPlayingWarzone(presence) {
        return presence?.activities?.some(a => 
            a.type === 0 && CONFIG.KEYWORDS.some(k => (a.name || '').toLowerCase().includes(k))
        );
    }

    getGameName(presence) {
        return presence?.activities?.find(a => a.type === 0)?.name || 'Call of Duty';
    }

    async deletePreviousMessage(channel) {
        try {
            const doc = await db.collection('system_metadata').doc('fifo_warzone').get();
            if (doc.exists && doc.data().lastAnnouncementId) {
                const msg = await channel.messages.fetch(doc.data().lastAnnouncementId).catch(() => null);
                if (msg) await msg.delete();
            }
        } catch (e) {}
    }
}

module.exports = new WarzoneAnnouncer();