// 📁 handlers/fifo/manager.js
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { Readable } = require('stream');
const { log } = require('../../utils/logger');

// ✅ התיקון: חיבור למערכת ה-TTS החדשה (במקום הקובץ שנמחק)
const openaiTTS = require('../voice/openaiTTS'); 

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
        const session = { channels: [], votes: new Map(), lobbyId: lobbyId, createdAt: Date.now() };

        // ניקוי ערוצים ישנים
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
                for (const memberData of squad.members) {
                    // המערכת שלך מעבירה אובייקטים, צריך לוודא שזה Member אמיתי
                    const member = await guild.members.fetch(memberData.id).catch(() => null);
                    if (member && member.voice.channel) {
                        await member.voice.setChannel(channel).catch(e => log(`Move fail: ${member.displayName}`));
                    }
                }

                // ✅ החזרתי את ה-Embed והכפתורים שלך!
                const embed = new EmbedBuilder()
                    .setTitle(`🛡️ ${squad.name}`)
                    .setDescription(squad.members.map(m => `• ${m.displayName || m.name}`).join('\n')) // תמיכה בשמות
                    .setColor('#2ecc71');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`fifo_vote_${squad.name}`).setLabel('🏳️ הצבעה ל-Replay').setStyle(ButtonStyle.Secondary)
                );

                await channel.send({ embeds: [embed], components: [row] });

                // ✅ הכרזה קולית (עם המערכת החדשה)
                setTimeout(() => {
                    this.announceInChannel(channel, `בהצלחה ל${squad.name}! תנו בראש.`);
                }, 2000);

            } catch (error) {
                log(`❌ Error creating channel for ${squad.name}: ${error.message}`);
            }
        }

        this.activeSessions.set(guild.id, session);
        return session.channels;
    }

    /**
     * פונקציה חדשה שמחליפה את playTTSInVoiceChannel הישן
     */
    async announceInChannel(channel, text) {
        if (!channel || !text) return;
        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false
            });

            const buffer = await openaiTTS.generateSpeech(text);
            if (!buffer) return;

            const stream = Readable.from(buffer);
            const resource = createAudioResource(stream);
            const player = createAudioPlayer();

            connection.subscribe(player);
            player.play(resource);
        } catch (e) {
            log(`❌ [FIFO TTS] Error: ${e.message}`);
        }
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
     * ✅ לוגיקת הצבעה (החזרתי את הפונקציה המקורית שלך)
     */
    async handleVote(interaction, teamName) {
        const guildId = interaction.guild.id;
        const session = this.activeSessions.get(guildId);
        
        if (!session) return { status: 'expired' };

        if (!session.votes.has(teamName)) session.votes.set(teamName, new Set());
        const teamVotes = session.votes.get(teamName);

        if (teamVotes.has(interaction.user.id)) return { status: 'already_voted' };
        
        teamVotes.add(interaction.user.id);
        
        const channel = session.channels.find(c => c.name.includes(teamName));
        const currentMembers = channel ? channel.members.size : 99;
        
        const passed = teamVotes.size >= (currentMembers / 2);

        return { 
            status: 'voted', 
            count: teamVotes.size, 
            needed: currentMembers,
            passed: passed,
            session: session 
        };
    }

    /**
     * ✅ ריפליי מלא (החזרתי את הפונקציה המקורית שלך)
     */
    async resetSession(guild, session) {
        if (!session) return;
        
        const lobbyChannel = guild.channels.cache.get(session.lobbyId);
        
        // 1. הודעה קולית והעברה
        for (const channel of session.channels) {
            try {
                // שימוש במערכת החדשה
                this.announceInChannel(channel, "הוחלט על ריפליי! כולם חוזרים ללובי.");
                
                if (lobbyChannel) {
                    for (const [id, member] of channel.members) {
                        await member.voice.setChannel(lobbyChannel).catch(() => {});
                    }
                }
            } catch (e) {
                console.error(`Error resetting channel ${channel.name}:`, e);
            }
        }

        // 2. מחיקת ערוצים
        setTimeout(() => {
            session.channels.forEach(c => c.delete().catch(() => {}));
            this.activeSessions.delete(guild.id);
        }, 3000);
    }

    /**
     * איפוס ידני (פקודת אדמין)
     */
    async reset(interaction) {
        const guild = interaction.guild;
        const session = this.activeSessions.get(guild.id);
        if (!session) return interaction.reply({ content: '❌ אין משחק פעיל.', ephemeral: true });

        await interaction.reply('🚨 מנהל ביצע איפוס ידני...');
        await this.resetSession(guild, session);
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