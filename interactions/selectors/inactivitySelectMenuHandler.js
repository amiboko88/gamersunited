// 📁 interactions/selectors/inactivitySelectMenuHandler.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../utils/firebase');
const { sendStaffLog } = require('../../utils/staffLogger');
const { createPaginatedFields } = require('../../utils/embedUtils');
// ✅ ייבוא המנוע הגרפי החדש
const { generateStatusPieChart } = require('../../utils/graphGenerator');

// --- פונקציית ליבה: איסוף ועיבוד נתונים ---
async function fetchAndProcessInactivityData(interactionOrGuild) {
    const guild = interactionOrGuild.guild || interactionOrGuild;
    if (!guild) throw new Error("Guild not found.");

    // שליפת כל המשתמשים
    const allUsersSnapshot = await db.collection('users').get();
    
    // Cache של חברי השרת (כדי לדעת מי כבר עזב ולא צריך לספור אותו)
    const members = await guild.members.fetch().catch(() => new Map());

    const processedData = {
        stats: { 
            total: 0,
            active: 0,
            inactive7Days: 0, 
            inactive14Days: 0, 
            inactive30Days: 0, 
            failedDM: 0, 
            repliedDM: 0 
        },
        lists: { inactive7: [], inactive14: [], inactive30: [], failedDM: [], replied: [] },
    };

    const now = Date.now();

    for (const doc of allUsersSnapshot.docs) {
        const data = doc.data();
        const userId = doc.id;
        
        // אם המשתמש לא נמצא בשרת, מדלגים עליו (או שהוא בוט)
        const member = members.get(userId);
        if (!member || member.user.bot) continue; 

        // לוגיקה חכמה לבחירת התאריך הקובע
        const lastActiveISO = data.meta?.lastActive || data.tracking?.lastActivity || data.tracking?.joinedAt;
        const statusStage = data.tracking?.statusStage || 'active';
        
        let daysInactive = 0;
        if (lastActiveISO) {
            const lastActiveTime = new Date(lastActiveISO).getTime();
            daysInactive = Math.floor((now - lastActiveTime) / (1000 * 60 * 60 * 24));
        }

        processedData.stats.total++;
        
        // סיווג לקטגוריות
        if (statusStage === 'failed_dm') {
            processedData.stats.failedDM++;
            processedData.lists.failedDM.push(`<@${userId}>`);
        } 
        else if (daysInactive >= 30) {
            processedData.stats.inactive30Days++;
            processedData.lists.inactive30.push(`<@${userId}> (**${daysInactive}** יום)`);
        } 
        else if (daysInactive >= 14) {
            processedData.stats.inactive14Days++;
            processedData.lists.inactive14.push(`<@${userId}> (**${daysInactive}** יום)`);
        } 
        else if (daysInactive >= 7) {
            processedData.stats.inactive7Days++;
            processedData.lists.inactive7.push(`<@${userId}> (**${daysInactive}** יום)`);
        } 
        else {
            processedData.stats.active++;
        }

        if (statusStage === 'active' && data.tracking?.lastAliveResponse) {
            processedData.stats.repliedDM++;
            processedData.lists.replied.push(`<@${userId}>`);
        }
    }
    return processedData;
}

// --- פונקציות תצוגה משודרגות ---

/**
 * בונה את ה-Embed הראשי עם הגרף (Dashboard)
 */
function buildMainPanelEmbed(statsData) {
    // יצירת הגרף דרך המנוע החדש
    const chartUrl = generateStatusPieChart(statsData.stats);

    return new EmbedBuilder()
        .setTitle('📊 Shimon Analytics Dashboard')
        .setDescription(`
        **מצב הקהילה בזמן אמת:**
        מציג פילוח של ${statsData.stats.total} משתמשים המחוברים לשרת.
        `)
        .addFields(
            { name: '🟢 פעילים', value: `${statsData.stats.active}`, inline: true },
            { name: '🟡 רדומים (7+)', value: `${statsData.stats.inactive7Days}`, inline: true },
            { name: '🟠 בסיכון (14+)', value: `${statsData.stats.inactive14Days}`, inline: true },
            { name: '🔴 לניקוי (30+)', value: `${statsData.stats.inactive30Days}`, inline: true },
            { name: '⚫ חסומים (DM)', value: `${statsData.stats.failedDM}`, inline: true },
            { name: '✨ הגיבו לאזהרה', value: `${statsData.stats.repliedDM}`, inline: true }
        )
        .setColor('#2b2d31') // צבע כהה מודרני
        .setImage(chartUrl) // ✅ הגרף מוטמע כאן
        .setFooter({ text: 'נתונים בזמן אמת • Shimon 2026', iconURL: 'https://cdn-icons-png.flaticon.com/512/1055/1055644.png' })
        .setTimestamp();
}

function buildMainPanelComponents() {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('inactivity_action_select')
        .setPlaceholder('🔍 בחר קטגוריה לסינון וניהול')
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('חזור ללוח הראשי').setValue('show_stats').setEmoji('📊'),
            new StringSelectMenuOptionBuilder().setLabel('הצג רדומים (7+)').setValue('inactive_7').setEmoji('🟡'),
            new StringSelectMenuOptionBuilder().setLabel('הצג בסיכון (14+)').setValue('inactive_14').setEmoji('🟠'),
            new StringSelectMenuOptionBuilder().setLabel('הצג מועמדים להרחקה (30+)').setValue('inactive_30').setEmoji('🔴'),
            new StringSelectMenuOptionBuilder().setLabel('נכשלו בשליחה (DM)').setValue('failed_dm').setEmoji('❌')
        );

    // כפתור הרחקה מסוכן - מופרד בשורה משלו
    const kickButton = new ButtonBuilder()
        .setCustomId('kick_inactive_users')
        .setLabel('ניקוי משתמשים (Kick Auto)')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️');

    return [
        new ActionRowBuilder().addComponents(selectMenu),
        new ActionRowBuilder().addComponents(kickButton)
    ];
}

function buildUserListEmbed(title, userList, color) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: `סה"כ בקטגוריה: ${userList.length}` });

    if (!userList || userList.length === 0) {
        embed.setDescription("✅ הקטגוריה ריקה! המצב מצוין.");
    } else {
        const fields = createPaginatedFields('רשימת משתמשים', userList);
        fields.slice(0, 25).forEach(field => embed.addFields(field));
    }
    return embed;
}

// --- Handler ---
module.exports = {
    fetchAndProcessInactivityData,
    buildMainPanelEmbed,
    buildMainPanelComponents,

    customId: (interaction) => interaction.customId === 'inactivity_action_select',

    async execute(interaction, client) {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '⛔ גישה למנהלים בלבד.', flags: MessageFlags.Ephemeral });
        }

        // שימוש ב-deferUpdate כי אנחנו משנים הודעה קיימת (חלק יותר בעין)
        await interaction.deferUpdate(); 

        try {
            const selectedValue = interaction.values[0];
            const data = await fetchAndProcessInactivityData(interaction);
            let embed;

            switch (selectedValue) {
                case 'show_stats':
                    embed = buildMainPanelEmbed(data);
                    break;
                case 'inactive_7':
                    embed = buildUserListEmbed('🟡 משתמשים רדומים (7+ ימים)', data.lists.inactive7, '#f1c40f');
                    break;
                case 'inactive_14':
                    embed = buildUserListEmbed('🟠 משתמשים בסיכון (14+ ימים)', data.lists.inactive14, '#e67e22');
                    break;
                case 'inactive_30':
                    embed = buildUserListEmbed('🔴 משתמשים לא פעילים (30+ ימים)', data.lists.inactive30, '#e74c3c');
                    break;
                case 'failed_dm':
                    embed = buildUserListEmbed('❌ משתמשים שנכשלו (DM חסום)', data.lists.failedDM, '#95a5a6');
                    break;
                default:
                    return;
            }

            await interaction.editReply({ embeds: [embed], components: buildMainPanelComponents() });

        } catch (error) {
            console.error("❌ שגיאה ב-inactivitySelectMenuHandler:", error);
            await sendStaffLog('❌ שגיאה בלוח ניהול', `שגיאה: ${error.message}`, 0xFF0000);
            await interaction.followUp({ content: 'אירעה שגיאה בטעינת הנתונים.', flags: MessageFlags.Ephemeral });
        }
    }
};