// 📁 utils/squadBuilder.js (משודרג)
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log } = require('./logger');

const createdChannels = new Map();

function getCreatedChannels() {
    return createdChannels;
}

/**
 * [שדרוג] אלגוריתם חכם לחלוקת קבוצות הממזער ממתינים.
 */
async function createGroupsAndChannels({ interaction, members, groupSize, categoryId }) {
    await cleanupFifo(interaction);

    const shuffledMembers = [...members].sort(() => 0.5 - Math.random());
    const memberCount = shuffledMembers.length;
    const squads = [];
    let waiting = [];

    let membersToAssign = [...shuffledMembers];

    // יצירת קבוצות מלאות
    while (membersToAssign.length >= groupSize) {
        squads.push(membersToAssign.splice(0, groupSize));
    }

    // טיפול בשארית
    const remainingCount = membersToAssign.length;
    if (remainingCount > 0) {
        // אם השארית מספיק גדולה לקבוצה קטנה (למשל, 3 נשארו כשביקשו 4)
        // או אם אין בכלל קבוצות מלאות (למשל, 3 אנשים ביקשו קבוצה של 4)
        if (remainingCount >= groupSize - 1 || squads.length === 0) {
            squads.push(membersToAssign);
        } else {
            waiting = membersToAssign;
        }
    }

    const channels = [];
    for (let i = 0; i < squads.length; i++) {
        const teamName = `TEAM ${String.fromCharCode(65 + i)}`;
        const currentSquad = squads[i];
        try {
            const channel = await interaction.guild.channels.create({
                name: teamName,
                type: ChannelType.GuildVoice,
                parent: categoryId,
                userLimit: currentSquad.length, // הגודל יכול להיות שונה מהמבוקש
            });
            channels.push(channel);
            createdChannels.set(channel.id, channel);

            for (const member of currentSquad) {
                await member.voice.setChannel(channel).catch(err => {
                    log(`⚠️ לא ניתן היה להעביר את ${member.displayName}: ${err.message}`);
                });
            }
            log(`✅ נוצר ערוץ ${teamName} והועברו אליו ${currentSquad.length} חברים.`);
        } catch (error) {
            log(`❌ שגיאה ביצירת ערוץ או העברת חברים עבור ${teamName}:`, error);
            throw new Error('Failed to create team channels.');
        }
    }

    return { channels, squads, waiting };
}

async function cleanupFifo(interaction, originalVoiceChannel = null) {
    log('🧼 מתחיל תהליך ניקוי פיפו...');
    const channelsToDelete = getCreatedChannels();

    for (const [channelId, channel] of channelsToDelete) {
        try {
            if (originalVoiceChannel) {
                for (const member of channel.members.values()) {
                    await member.voice.setChannel(originalVoiceChannel).catch(() => {});
                }
            }
            await channel.delete('איפוס פיפו').catch(() => {});
            log(`🗑️ נמחק ערוץ פיפו: ${channel.name}`);
        } catch (error) {
            log(`⚠️ שגיאה במחיקת ערוץ פיפו ${channel.name}: ${error.message}`);
        }
    }
    createdChannels.clear();
}

function buildTeamMessage(teamName, squadMembers, teamIndex) {
    const TEAM_COLORS = ['#3498DB', '#E74C3C', '#2ECC71', '#F1C40F', '#9B59B6', '#34495E'];

    const embed = new EmbedBuilder()
        .setColor(TEAM_COLORS[teamIndex % TEAM_COLORS.length])
        .setTitle(`\u200FTEAM ${String.fromCharCode(65 + teamIndex)}`) // \u200F for RTL
        .setDescription('**חברי הקבוצה:**\n' + squadMembers.map(m => `> <:dott:1140333334958129283> <@${m.id}>`).join('\n'))
        .setFooter({ text: 'לחצו על הכפתור כדי להצביע לאיפוס הקבוצה.' });

    const resetButton = new ButtonBuilder()
        .setCustomId(`reset_team_${teamName}`)
        .setLabel('איפוס קבוצתי')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄');

    const row = new ActionRowBuilder().addComponents(resetButton);

    return { embeds: [embed], components: [row] };
}

module.exports = {
    createGroupsAndChannels,
    cleanupFifo,
    getCreatedChannels,
    buildTeamMessage
};