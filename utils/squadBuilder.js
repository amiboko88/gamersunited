// 📁 utils/squadBuilder.js
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log } = require('./logger');

const createdChannels = new Map(); // מפה לשמירת הערוצים שנוצרו

/**
 * מחזיר את רשימת הערוצים שנוצרו על ידי הפקודה האחרונה.
 * @returns {Map<string, import('discord.js').VoiceChannel>}
 */
function getCreatedChannels() {
    return createdChannels;
}

/**
 * יוצר קבוצות וערוצים קוליים.
 */
async function createGroupsAndChannels({ interaction, members, groupSize, categoryId }) {
    await cleanupFifo(interaction); // ניקוי מקדים של ערוצים ישנים

    const shuffledMembers = [...members].sort(() => 0.5 - Math.random());
    const numGroups = Math.floor(shuffledMembers.length / groupSize);
    const squads = [];
    const channels = [];
    const waiting = shuffledMembers.slice(numGroups * groupSize);

    for (let i = 0; i < numGroups; i++) {
        const squad = shuffledMembers.slice(i * groupSize, (i + 1) * groupSize);
        squads.push(squad);
    }

    for (let i = 0; i < squads.length; i++) {
        const teamName = `TEAM ${String.fromCharCode(65 + i)}`;
        try {
            const channel = await interaction.guild.channels.create({
                name: teamName,
                type: ChannelType.GuildVoice,
                parent: categoryId,
                userLimit: groupSize,
            });
            channels.push(channel);
            createdChannels.set(channel.id, channel); // שמירת הערוץ שנוצר

            for (const member of squads[i]) {
                await member.voice.setChannel(channel).catch(err => {
                    log(`⚠️ לא ניתן היה להעביר את ${member.displayName}: ${err.message}`);
                });
            }
            log(`✅ נוצר ערוץ ${teamName} והועברו אליו ${squads[i].length} חברים.`);
        } catch (error) {
            log(`❌ שגיאה ביצירת ערוץ או העברת חברים עבור ${teamName}:`, error);
            throw new Error('Failed to create team channels.');
        }
    }

    return { channels, squads, waiting };
}

/**
 * מנקה את כל ערוצי הפיפו שנוצרו.
 */
async function cleanupFifo(interaction, originalVoiceChannel = null) {
    log('🧼 מתחיל תהליך ניקוי פיפו...');
    const channelsToDelete = getCreatedChannels();

    for (const [channelId, channel] of channelsToDelete) {
        try {
            // העבר חזרה לערוץ המקורי אם הוא קיים
            if (originalVoiceChannel) {
                for (const member of channel.members.values()) {
                    await member.voice.setChannel(originalVoiceChannel).catch(() => {});
                }
            }
            await channel.delete('איפוס פיפו');
            log(`🗑️ נמחק ערוץ פיפו: ${channel.name}`);
        } catch (error) {
            log(`⚠️ שגיאה במחיקת ערוץ פיפו ${channel.name}: ${error.message}`);
        }
    }
    createdChannels.clear(); // איפוס המפה
}

/**
 * ✅ [שדרוג] בונה הודעה מעוצבת וכפתור איפוס עבור כל קבוצה.
 * @param {string} teamName - e.g., "TEAM A"
 * @param {import('discord.js').GuildMember[]} squadMembers
 * @param {number} teamIndex
 * @returns {{embeds: EmbedBuilder[], components: ActionRowBuilder[]}}
 */
function buildTeamMessage(teamName, squadMembers, teamIndex) {
    const TEAM_COLORS = ['#3498DB', '#E74C3C', '#2ECC71', '#F1C40F', '#9B59B6', '#34495E'];

    const embed = new EmbedBuilder()
        .setColor(TEAM_COLORS[teamIndex % TEAM_COLORS.length])
        .setTitle(`\\[ ${teamName} \\] - בהצלחה בקרב!`)
        .setDescription('**חברי הקבוצה:**\n' + squadMembers.map(m => `> <:dott:1140333334958129283> <@${m.id}>`).join('\n'))
        .setThumbnail('https://i.imgur.com/gJ4d1t1.png')
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
    buildTeamMessage // ✅ ייצוא הפונקציה החדשה
};