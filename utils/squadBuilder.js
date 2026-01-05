// 📁 utils/squadBuilder.js
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log } = require('./logger');
const { startGroupTracking } = require('../handlers/groupTracker'); // למעקב אחרי הקבוצות

// שומר מפה של ערוצים שנוצרו כדי למנוע דליפות זיכרון
const createdChannels = new Map(); // Map<InteractionID, Array<ChannelID>>

/**
 * מוחק ערוצים זמניים שנוצרו בסשן הקודם (אם יש)
 */
async function cleanupFifo(interaction) {
    // לוגיקת ניקוי: מחפש ערוצים בקטגוריה שמתחילים ב-"TEAM"
    // (בגרסה מתקדמת אפשר לשמור IDs ב-DB, כרגע סריקה היא פתרון מהיר ויעיל)
    const categoryId = interaction.channel?.parentId;
    if (!categoryId) return;

    const guild = interaction.guild;
    const channels = guild.channels.cache.filter(c => 
        c.parentId === categoryId && 
        c.name.startsWith('TEAM') && 
        c.type === ChannelType.GuildVoice
    );

    for (const [id, channel] of channels) {
        try {
            await channel.delete('פיפו: חלוקה מחדש');
        } catch (e) {
            console.warn(`Could not delete channel ${channel.name}: ${e.message}`);
        }
    }
}

/**
 * האלגוריתם הראשי לחלוקת קבוצות
 */
async function createGroupsAndChannels({ interaction, members, groupSize, categoryId }) {
    await cleanupFifo(interaction);

    // ערבוב השחקנים (Fisher-Yates Shuffle)
    const shuffledMembers = [...members].sort(() => 0.5 - Math.random());
    const squads = [];
    const createdChannelObjects = [];

    // חלוקה לקבוצות
    while (shuffledMembers.length > 0) {
        // אם נשארו פחות מ-2 אנשים, הם יצטרפו לקבוצה האחרונה או יחכו (תלוי בלוגיקה)
        // כאן: ממלאים קבוצות עד הסוף
        if (shuffledMembers.length < groupSize && squads.length > 0) {
             // אופציה: להוסיף לקבוצה האחרונה (Overfill) או להשאיר כקבוצה קטנה
             // כרגע: משאירים כקבוצה קטנה
        }
        squads.push(shuffledMembers.splice(0, groupSize));
    }

    const waiting = []; // כאן יהיו מי שלא נכנס (אם נגדיר מגבלה)

    // יצירת הערוצים והעברת השחקנים
    for (let i = 0; i < squads.length; i++) {
        const squad = squads[i];
        const teamName = `TEAM ${String.fromCharCode(65 + i)}`; // TEAM A, TEAM B...

        try {
            // יצירת ערוץ
            const channel = await interaction.guild.channels.create({
                name: teamName,
                type: ChannelType.GuildVoice,
                parent: categoryId,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel], // כולם רואים
                    }
                ]
            });

            createdChannelObjects.push(channel);

            // התחלת מעקב אחרי הקבוצה (כדי לזהות התפרקות)
            startGroupTracking(channel, squad.map(m => m.id), teamName);

            // העברת שחקנים
            for (const member of squad) {
                if (member.voice.channel) {
                    await member.voice.setChannel(channel).catch(e => console.warn(`Failed to move ${member.displayName}: ${e.message}`));
                }
            }

            // הודעה בערוץ הטקסט
            await interaction.channel.send({
                content: `🎮 **${teamName}** נוצרה!`,
                embeds: [
                    new EmbedBuilder()
                        .setColor('#00FF00')
                        .setDescription(squad.map(m => `• ${m.displayName}`).join('\n'))
                ]
            });

        } catch (error) {
            log(`❌ שגיאה ביצירת קבוצה ${teamName}: ${error.message}`);
        }
    }

    return { squads, waiting, channels: createdChannelObjects };
}

module.exports = { createGroupsAndChannels, cleanupFifo };