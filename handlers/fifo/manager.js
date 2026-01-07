// 📁 handlers/fifo/manager.js
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log } = require('../../utils/logger');
const { playTTSInVoiceChannel } = require('../../utils/ttsQuickPlay'); 

class FifoManager {
    constructor() {
        this.activeSessions = new Map(); // GuildID -> { channels: [], votes: Map, lobbyId: string, createdAt: number }
        this.startCleanupLoop();
    }

    /**
     * יוצר ערוצים ומעביר שחקנים
     */
    async setupChannels(interaction, enrichedSquads, categoryId, lobbyId) {
        const guild = interaction.guild;
        // שומרים גם את ה-Lobby ID כדי לדעת לאן להחזיר אותם בסוף
        const session = { channels: [], votes: new Map(), lobbyId: lobbyId, createdAt: Date.now() };

        // ניקוי ערוצים ישנים באותה קטגוריה (למניעת כפילויות)
        await this.cleanupCategory(guild, categoryId);

        for (const squad of enrichedSquads) {
            try {
                // יצירת ערוץ קול
                const channel = await guild.channels.create({
                    name: `🎮 ${squad.name}`,
                    type: ChannelType.GuildVoice,
                    parent: categoryId,
                    permissionOverwrites: [{ id: guild.id, allow: [PermissionFlagsBits.ViewChannel] }]
                });

                session.channels.push(channel);

                // העברת שחקנים
                for (const member of squad.members) {
                    if (member.voice.channel) {
                        await member.voice.setChannel(channel).catch(e => console.warn(`Move fail: ${member.displayName}`));
                    }
                }

                // הודעה בתוך הערוץ החדש + כפתור הצבעה
                const embed = new EmbedBuilder()
                    .setTitle(`🛡️ ${squad.name}`)
                    .setDescription(squad.members.map(m => `• ${m.displayName}`).join('\n'))
                    .setColor('#2ecc71');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`fifo_vote_${squad.name}`).setLabel('🏳️ הצבעה ל-Replay').setStyle(ButtonStyle.Secondary)
                );

                await channel.send({ embeds: [embed], components: [row] });

                // הכרזה קולית
                setTimeout(() => {
                    playTTSInVoiceChannel(channel, `בהצלחה ל${squad.name}! תנו בראש.`);
                }, 2000);

            } catch (error) {
                log(`❌ Error creating channel for ${squad.name}: ${error.message}`);
            }
        }

        this.activeSessions.set(guild.id, session);
        return session.channels;
    }

    /**
     * ניקוי ערוצים ישנים
     */
    async cleanupCategory(guild, categoryId) {
        if (!categoryId) return;
        const channels = guild.channels.cache.filter(c => 
            c.parentId === categoryId && 
            c.name.startsWith('🎮') && 
            c.type === ChannelType.GuildVoice
        );
        
        for (const [id, channel] of channels) {
            await channel.delete('FIFO Cleanup').catch(() => {});
        }
    }

    /**
     * לוגיקת הצבעה (Replay/Reset)
     */
    async handleVote(interaction, teamName) {
        const guildId = interaction.guild.id;
        const session = this.activeSessions.get(guildId);
        
        if (!session) return { status: 'expired' };

        if (!session.votes.has(teamName)) session.votes.set(teamName, new Set());
        const teamVotes = session.votes.get(teamName);

        if (teamVotes.has(interaction.user.id)) return { status: 'already_voted' };
        
        teamVotes.add(interaction.user.id);
        
        // בדיקה כמה אנשים יש בערוץ כרגע
        const channel = session.channels.find(c => c.name.includes(teamName));
        const currentMembers = channel ? channel.members.size : 99;
        
        // בדיקת רוב בקבוצה
        const passed = teamVotes.size >= (currentMembers / 2);

        return { 
            status: 'voted', 
            count: teamVotes.size, 
            needed: currentMembers,
            passed: passed,
            session: session // מחזיר את הסשן להמשך טיפול
        };
    }

    /**
     * ♻️ מבצע ריפליי מלא: מחזיר את כולם ללובי ומוחק חדרים
     * (מחליף את repartitionUtils)
     */
    async resetSession(guild, session) {
        if (!session) return;
        
        const lobbyChannel = guild.channels.cache.get(session.lobbyId);
        
        // 1. הודעה קולית והעברה
        for (const channel of session.channels) {
            try {
                // הכרזה בחדרים
                playTTSInVoiceChannel(channel, "הוחלט על ריפליי! כולם חוזרים ללובי.");
                
                // העברה ללובי (אם הוא קיים)
                if (lobbyChannel) {
                    for (const [id, member] of channel.members) {
                        await member.voice.setChannel(lobbyChannel).catch(() => {});
                    }
                }
            } catch (e) {
                console.error(`Error resetting channel ${channel.name}:`, e);
            }
        }

        // 2. מחיקת ערוצים (עם דיליי קטן כדי שנספיק לעבור)
        setTimeout(() => {
            session.channels.forEach(c => c.delete().catch(() => {}));
            this.activeSessions.delete(guild.id);
        }, 3000);
    }

    /**
     * משימת רקע לניקוי ערוצים ריקים
     */
    startCleanupLoop() {
        setInterval(() => {
            const now = Date.now();
            this.activeSessions.forEach(async (session, guildId) => {
                let allEmpty = true;
                for (const channel of session.channels) {
                    const fetched = await channel.guild.channels.fetch(channel.id).catch(() => null);
                    if (fetched && fetched.members.size > 0) allEmpty = false;
                }

                // אם עברו 5 דקות וכולם ריקים - נמחק
                if (allEmpty && (now - session.createdAt > 5 * 60 * 1000)) {
                    log(`[FIFO] מנקה סשן לא פעיל בשרת ${guildId}`);
                    session.channels.forEach(c => c.delete().catch(() => {}));
                    this.activeSessions.delete(guildId);
                }
            });
        }, 60000); 
    }
}

module.exports = new FifoManager();