// 📁 interactions/selectors/inactivitySelectMenuHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../utils/firebase');
const { sendStaffLog } = require('../../utils/staffLogger');

// --- ✅ [שדרוג] פונקציית ליבה חדשה לאיסוף ועיבוד כל הנתונים ---
/**
 * סורק את הדאטהבייס פעם אחת ומכין אובייקט מקיף עם כל הנתונים הנדרשים לפאנל.
 * @param {import('discord.js').Client} client
 * @returns {Promise<Object>}
 */
async function fetchAndProcessInactivityData(client) {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) throw new Error("Guild not found.");

    const allTrackedDocs = await db.collection('memberTracking').get();
    const now = Date.now();
    const members = await guild.members.fetch().catch(() => new Map());

    const processedData = {
        stats: { inactive7Days: 0, inactive14Days: 0, inactive30Days: 0, failedDM: 0, repliedDM: 0, kickedUsers: 0 },
        lists: { inactive7: [], inactive14: [], inactive30: [], failedDM: [], replied: [] },
        statusSummary: {},
    };

    for (const doc of allTrackedDocs.docs) {
        const data = doc.data();
        const userId = doc.id;
        const member = members.get(userId);
        
        const statusKey = member ? (data.statusStage || 'active') : (data.statusStage || 'left');
        processedData.statusSummary[statusKey] = (processedData.statusSummary[statusKey] || 0) + 1;

        if (member && member.user.bot) {
            processedData.statusSummary['bot'] = (processedData.statusSummary['bot'] || 0) + 1;
            continue;
        }
        
        if (!member || ['left', 'kicked'].includes(data.statusStage)) {
            if (data.statusStage === 'kicked') processedData.stats.kickedUsers++;
            continue;
        }

        const lastActivity = new Date(data.lastActivity || data.joinedAt || 0).getTime();
        const daysInactive = Math.floor((now - lastActivity) / 86400000);
        const userObject = { id: userId, data, daysInactive };

        if (daysInactive >= 30) {
            processedData.stats.inactive30Days++;
            processedData.lists.inactive30.push(userObject);
        }
        if (daysInactive >= 14) {
            processedData.stats.inactive14Days++;
            processedData.lists.inactive14.push(userObject);
        }
        if (daysInactive >= 7) {
            processedData.stats.inactive7Days++;
            processedData.lists.inactive7.push(userObject);
        }
        if (data.statusStage === 'failed_dm') {
            processedData.stats.failedDM++;
            processedData.lists.failedDM.push(userObject);
        }
        if (data.statusStage === 'responded') {
            processedData.stats.repliedDM++;
            processedData.lists.replied.push(userObject);
        }
    }
    
    for (const list of Object.values(processedData.lists)) {
        list.sort((a, b) => b.daysInactive - a.daysInactive);
    }
    
    return processedData;
}

// --- פונקציות עזר לבניית UI (לא השתנו, רק מקור הנתונים שלהן) ---

function buildStatusSummaryEmbed(summary, client) {
    const statusMap = {
      joined: '🆕 הצטרף', waiting_dm: '⏳ ממתין לתזכורת 1', dm_sent: '📩 תזכורת 1 נשלחה',
      final_warning: '🔴 תזכורת 2 סופית (ידנית)', final_warning_auto: '🚨 תזכורת 2 סופית (אוטומטית)',
      responded: '💬 הגיב ל-DM', failed_dm: '❌ כשלון שליחת DM', active: '✅ פעיל',
      left: '🚪 עזב את השרת', kicked: '🚫 הורחק מהשרת', bot: '🤖 בוט',
    };
    const order = ['active', 'responded', 'joined', 'waiting_dm', 'dm_sent', 'final_warning', 'final_warning_auto', 'failed_dm', 'kicked', 'left'];
    const sortedStatuses = Object.keys(summary).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const fields = sortedStatuses.map(key => ({
        name: `${statusMap[key]?.split(' ')[0] || '❓'} ${statusMap[key]?.substring((statusMap[key]?.split(' ')[0] || '').length).trim() || key}`,
        value: `\`${summary[key]}\` משתמשים`, inline: true
    }));
    while (fields.length % 3 !== 0) fields.push({ name: '\u200B', value: '\u200B', inline: true });
    return new EmbedBuilder().setTitle('📊 דוח סטטוס מפורט של משתמשי השרת')
        .setDescription('פילוח מלא של כל המשתמשים במערכת הניטור, לפי שלב הסטטוס הנוכחי שלהם.')
        .addFields(fields).setColor(0x3498db)
        .setFooter({ text: `סה"כ משתמשים במעקב: ${Object.values(summary).reduce((a, b) => a + b, 0)}` }).setTimestamp();
}

function buildUserListEmbed(title, users, color, showStatus = false) {
    const userLines = users.map(user => {
        let line = `• <@${user.id}>`;
        if (user.daysInactive !== undefined) line += ` (${user.daysInactive} ימים)`;
        if (showStatus) line += ` (סטטוס: \`${user.data.statusStage || 'לא ידוע'}\`)`;
        return line;
    });
    const fields = createPaginatedFields(title, userLines);
    return new EmbedBuilder().setColor(color).addFields(fields)
        .setFooter({ text: `Shimon BOT – ניטור פעילות • ${users.length} משתמשים` }).setTimestamp();
}

function buildMainPanelEmbed(client, stats) {
    return new EmbedBuilder()
        .setTitle('📊 לוח בקרה וסטטוס פעילות משתמשים – שמעון BOT')
        .setDescription('ברוכים הבאים ללוח הבקרה המרכזי לניהול פעילות המשתמשים בשרת.')
        .setColor('#5865F2').setThumbnail(client.user.displayAvatarURL())
        .addFields(
            { name: '⚠️ לא פעילים (7+ ימים):', value: `\`${stats.inactive7Days}\` משתמשים`, inline: true },
            { name: '⛔ לא פעילים (14+ ימים):', value: `\`${stats.inactive14Days}\` משתמשים`, inline: true },
            { name: '🚨 לא פעילים (30+ ימים):', value: `\`${stats.inactive30Days}\` משתמשים`, inline: true },
            { name: '\u200B', value: '\u200B' },
            { name: '❌ כשלון שליחת DM:', value: `\`${stats.failedDM}\` משתמשים`, inline: true },
            { name: '✅ הגיבו ל־DM:', value: `\`${stats.repliedDM}\` משתמשים`, inline: true },
            { name: '🗑️ משתמשים שהורחקו:', value: `\`${stats.kickedUsers}\` משתמשים`, inline: true }
        )
        .setFooter({ text: 'Shimon BOT — מערכת ניהול פעילות מתקדמת', iconURL: client.user.displayAvatarURL() }).setTimestamp();
}

function buildMainPanelComponents() {
    const dmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('send_dm_batch_list').setLabel('שלח תזכורת רגילה 📨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('send_dm_batch_final_check').setLabel('שלח תזכורת סופית 🚨').setStyle(ButtonStyle.Danger)
    );
    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('inactivity_action_select').setPlaceholder('בחר פעולה מתקדמת או דוח מפורט ⬇️')
        .addOptions([
            { label: '📊 דוח סטטוס נוכחי (מפורט)', value: 'show_status_summary', emoji: '📈' },
            { label: '❌ רשימת כשלונות DM', value: 'show_failed_list', emoji: '🚫' },
            { label: '💬 רשימת מגיבים ל-DM', value: 'show_replied_list', emoji: '✅' },
            { label: '🗑️ הרחקת לא פעילים (בדיקה ואישור)', value: 'kick_failed_users', emoji: '🛑' },
            { label: '⏱️ הצג לא פעילים 7+ ימים', value: 'inactive_7', emoji: '⏳' },
            { label: '⌛ הצג לא פעילים 14+ ימים', value: 'inactive_14', emoji: '🗓️' },
            { label: '🛑 הצג לא פעילים 30+ ימים', value: 'inactive_30', emoji: '⛔' }
        ])
    );
    return [dmRow, selectRow];
}

function createPaginatedFields(title, items) {
    const fields = [];
    let currentContent = '';
    let pageNum = 1;
    if (items.length === 0) return [{ name: title, value: '— אין נתונים זמינים —', inline: false }];
    for (const item of items) {
        if (currentContent.length + item.length + 1 > 1024) {
            fields.push({ name: `${title} (עמוד ${pageNum})`, value: currentContent, inline: false });
            currentContent = item; pageNum++;
        } else {
            currentContent += (currentContent ? '\n' : '') + item;
        }
    }
    if (currentContent) fields.push({ name: `${title} (עמוד ${pageNum})`, value: currentContent, inline: false });
    return fields;
}

// --- פונקציית Handler ראשית (משתמשת עכשיו בנתונים המעובדים) ---
const execute = async (interaction, client) => {
    await interaction.deferReply({ ephemeral: true });
    const selectedValue = interaction.values?.[0];

    try {
        const data = await fetchAndProcessInactivityData(client);
        let embed;

        switch (selectedValue) {
            case 'show_status_summary':
                embed = buildStatusSummaryEmbed(data.statusSummary, client);
                break;
            case 'show_replied_list':
                embed = buildUserListEmbed('💬 משתמשים שהגיבו להודעה פרטית', data.lists.replied, '#2ECC71');
                break;
            case 'show_failed_list':
                embed = buildUserListEmbed('❌ משתמשים שנכשל DM אליהם', data.lists.failedDM, '#E74C3C', true);
                break;
            case 'inactive_7':
                embed = buildUserListEmbed('⏳ 7+ ימים ללא פעילות', data.lists.inactive7, '#F1C40F', true);
                break;
            case 'inactive_14':
                embed = buildUserListEmbed('🗓️ 14+ ימים ללא פעילות', data.lists.inactive14, '#E67E22', true);
                break;
            case 'inactive_30':
                embed = buildUserListEmbed('⛔ 30+ ימים ללא פעילות', data.lists.inactive30, '#992D22', true);
                break;
            default:
                await sendStaffLog(client, '⚠️ פעולת אינטראקציה לא מטופלת', `המשתמש ${interaction.user.tag} בחר בפעולה \`${selectedValue}\` שעדיין לא ממומשה.`, '#FEE75C');
                return interaction.editReply({ content: `הפעולה '${selectedValue}' עדיין בפיתוח.`, ephemeral: true });
        }
        return interaction.editReply({ embeds: [embed], ephemeral: true });

    } catch (error) {
        console.error("❌ שגיאה קריטית ב-inactivitySelectMenuHandler:", error);
        return interaction.editReply({ content: 'אירעה שגיאה חמורה בעת עיבוד הנתונים.', ephemeral: true });
    }
};

const customId = (interaction) => {
    return interaction.customId === 'inactivity_action_select';
};

// --- ייצוא כל הפונקציות לתאימות ---
module.exports = {
    customId,
    execute,
    // ייצוא הפונקציות הישנות נשאר לתאימות עם פקודת /inactivity
    getDetailedInactivityStats: async (client) => (await fetchAndProcessInactivityData(client)).stats,
    buildMainPanelEmbed,
    buildMainPanelComponents,
    // שאר הפונקציות מיוצאות לשימוש פנימי או עתידי, אם כי לא חובה
    getMemberStatusSummary: async (client) => (await fetchAndProcessInactivityData(client)).statusSummary,
    getInactiveUsersByDays: async (client, days) => {
        const data = await fetchAndProcessInactivityData(client);
        if (days >= 30) return data.lists.inactive30;
        if (days >= 14) return data.lists.inactive14;
        if (days >= 7) return data.lists.inactive7;
        return [];
    },
    getFailedDmUsers: async (client) => (await fetchAndProcessInactivityData(client)).lists.failedDM,
    getRepliedDmUsers: async (client) => (await fetchAndProcessInactivityData(client)).lists.replied,
    buildStatusSummaryEmbed,
    buildUserListEmbed,
    createPaginatedFields,
};