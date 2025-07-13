// 📁 interactions/selectors/inactivitySelectMenuHandler.js
const { EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../utils/firebase'); // נתיב יחסי נכון
const { sendStaffLog } = require('../../utils/staffLogger'); // נתיב יחסי נכון

// --- פונקציות עזר לשליפת נתונים ---

/**
 * @param {import('discord.js').Client} client
 */
async function getMemberStatusSummary(client) {
    const allTracked = await db.collection('memberTracking').get();
    const summary = {};
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const members = guild ? await guild.members.fetch().catch(() => new Map()) : new Map();

    for (const doc of allTracked.docs) {
        const d = doc.data();
        const userId = doc.id;
        const member = members.get(userId);

        if (member && member.user.bot) {
            summary['bot'] = (summary['bot'] || 0) + 1;
        } else if (!member) {
            if (d.statusStage === 'kicked') {
                summary['kicked'] = (summary['kicked'] || 0) + 1;
            } else if (d.statusStage === 'left') {
                summary['left'] = (summary['left'] || 0) + 1;
            } else {
                summary['left_unknown'] = (summary['left_unknown'] || 0) + 1;
            }
        } else {
            const status = d.statusStage || 'joined';
            summary[status] = (summary[status] || 0) + 1;
        }
    }
    return summary;
}

/**
 * @param {import('discord.js').Client} client
 * @param {number} days
 */
async function getInactiveUsersByDays(client, days) {
    const allTracked = await db.collection('memberTracking').get();
    const now = Date.now();
    const matches = [];
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) return [];

    const members = await guild.members.fetch().catch(() => new Map());

    for (const doc of allTracked.docs) {
        const d = doc.data();
        const userId = doc.id;
        const member = members.get(userId);

        if (!member || member.user.bot || userId === client.user.id) {
            continue;
        }

        const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
        const inactiveDays = Math.floor((now - last) / 86400000);

        if (inactiveDays >= days && !['left', 'kicked', 'responded', 'active'].includes(d.statusStage)) {
            matches.push({ id: userId, data: d, daysInactive: inactiveDays });
        }
    }
    matches.sort((a, b) => b.daysInactive - a.daysInactive);
    return matches;
}

/**
 * @param {import('discord.js').Client} client
 */
async function getFailedDmUsers(client) {
    const allTracked = await db.collection('memberTracking').get();
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const members = guild ? await guild.members.fetch().catch(() => new Map()) : new Map();

    return allTracked.docs.filter(doc => {
        const d = doc.data();
        const userId = doc.id;
        const member = members.get(userId);
        return d.dmFailed && !['left', 'kicked'].includes(d.statusStage) && member && !member.user.bot;
    });
}

/**
 * @param {import('discord.js').Client} client
 */
async function getRepliedDmUsers(client) {
    const allTracked = await db.collection('memberTracking').get();
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const members = guild ? await guild.members.fetch().catch(() => new Map()) : new Map();

    return allTracked.docs.filter(doc => {
        const d = doc.data();
        const userId = doc.id;
        const member = members.get(userId);
        return d.replied && !['left', 'kicked'].includes(d.statusStage) && member && !member.user.bot;
    });
}

/**
 * פונקציה לשליפת נתונים סטטיסטיים מפורטים על אי-פעילות.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 * @returns {Promise<Object>} - אובייקט עם נתונים מסוכמים.
 */
async function getDetailedInactivityStats(client) {
    const allTracked = await db.collection('memberTracking').get();
    const now = Date.now();
    let inactive7Days = 0;
    let inactive14Days = 0;
    let inactive30Days = 0;
    let failedDM = 0;
    let repliedDM = 0;
    let kickedUsers = 0;

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const members = guild ? await guild.members.fetch().catch(() => new Map()) : new Map();

    for (const doc of allTracked.docs) {
        const d = doc.data();
        const userId = doc.id;
        const member = members.get(userId);

        if (!member || member.user.bot || userId === client.user.id || ['left', 'kicked'].includes(d.statusStage)) {
            if (d.statusStage === 'kicked') kickedUsers++;
            continue;
        }

        const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
        const days = Math.floor((now - last) / 86400000);

        if (days >= 7) inactive7Days++;
        if (days >= 14) inactive14Days++;
        if (days >= 30) inactive30Days++;
        if (d.dmFailed) failedDM++;
        if (d.replied) repliedDM++;
    }
    return { inactive7Days, inactive14Days, inactive30Days, failedDM, repliedDM, kickedUsers };
}


// --- פונקציות עזר לבניית Embeds וקומפוננטות UI ---

/**
 * בונה את ה-Embed עבור סיכום הסטטוסים המפורט.
 * @param {Object} summary - אובייקט סיכום הסטטוסים מ-getMemberStatusSummary.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 * @returns {EmbedBuilder}
 */
function buildStatusSummaryEmbed(summary, client) {
    const statusMap = {
      joined: '🆕 הצטרף',
      waiting_dm: '⏳ ממתין לתזכורת 1',
      dm_sent: '📩 תזכורת 1 נשלחה',
      final_warning: '🔴 תזכורת 2 סופית (ידנית)',
      final_warning_auto: '🚨 תזכורת 2 סופית (אוטומטית)',
      responded: '💬 הגיב ל-DM',
      failed_dm: '❌ כשלון שליחת DM',
      active: '✅ פעיל',
      left: '🚪 עזב את השרת',
      kicked: '🚫 הורחק מהשרת',
      bot: '🤖 בוט',
      left_unknown: '❓ עזב (לא ידוע סטטוס)',
      unknown: '❓ לא ידוע'
    };

    const sortedStatuses = Object.keys(summary).sort((a, b) => {
        const order = ['active', 'responded', 'joined', 'waiting_dm', 'dm_sent', 'final_warning', 'final_warning_auto', 'failed_dm', 'kicked', 'left', 'left_unknown', 'bot', 'unknown'];
        return order.indexOf(a) - order.indexOf(b);
    });

    const fields = sortedStatuses.map(key => {
        const value = summary[key];
        const emoji = statusMap[key]?.split(' ')[0] || '';
        const label = statusMap[key]?.substring(emoji.length).trim() || key;

        return {
            name: `${emoji} ${label}`,
            value: `\`${value}\` משתמשים`,
            inline: true
        };
    });

    while (fields.length % 3 !== 0) {
        fields.push({ name: '\u200B', value: '\u200B', inline: true });
    }

    return new EmbedBuilder()
      .setTitle('📊 דוח סטטוס מפורט של משתמשי השרת')
      .setDescription('פילוח מלא של כל המשתמשים במערכת הניטור, לפי שלב הסטטוס הנוכחי שלהם.')
      .addFields(fields)
      .setColor(0x3498db)
      .setFooter({ text: `Shimon BOT – סה"כ משתמשים במעקב: ${Object.values(summary).reduce((a, b) => a + b, 0)}` })
      .setTimestamp();
}

/**
 * בונה Embed לרשימת משתמשים.
 * @param {string} title - כותרת ה-Embed.
 * @param {Array<Object>} users - מערך של אובייקטים { id: string, data: Object, daysInactive?: number }.
 * @param {string} color - צבע ה-Embed.
 * @param {boolean} showStatus - האם להציג את הסטטוס של המשתמש.
 * @returns {EmbedBuilder}
 */
function buildUserListEmbed(title, users, color, showStatus = false) {
    let description;
    if (users.length === 0) {
        description = '—';
    } else {
        const userLines = users.map(user => {
            let line = `• <@${user.id}>`;
            if (showStatus) {
                line += ` (סטטוס: ${user.data.statusStage || 'לא ידוע'})`;
            }
            if (user.daysInactive !== undefined) {
                line += ` (${user.daysInactive} ימים)`;
            }
            return line;
        });
        description = userLines.join('\n').slice(0, 4000);
    }

    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: `Shimon BOT – ניטור פעילות • ${users.length} משתמשים` })
        .setTimestamp();
}

/**
 * פונקציית עזר לבניית ה-Embed הראשי לפאנל הניהול של אי-פעילות.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 * @param {Object} stats - אובייקט הסטטיסטיקות מ-getDetailedInactivityStats.
 * @returns {import('discord.js').EmbedBuilder}
 */
function buildMainPanelEmbed(client, stats) {
    return new EmbedBuilder()
        .setTitle('📊 לוח בקרה וסטטוס פעילות משתמשים – שמעון BOT')
        .setDescription([
          'ברוכים הבאים ללוח הבקרה המרכזי לניהול פעילות המשתמשים בשרת.',
          'כאן תוכלו לצפות בסטטוסים עדכניים, להפיק דוחות ולבצע פעולות ניהול מתקדמות.',
          '',
          `**🌐 מצב ניטור אוטומטי:** 🟢 פעיל ויציב`,
          `**🔄 עדכון נתונים:** 🕒 כל 30 דקות (אוטומטי)`,
          `**📊 סטטוסים עיקריים:**`
        ].join('\n'))
        .setColor('#5865F2')
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          { name: '⚠️ לא פעילים (7+ ימים):', value: `\`${stats.inactive7Days}\` משתמשים`, inline: true },
          { name: '⛔ לא פעילים (14+ ימים):', value: `\`${stats.inactive14Days}\` משתמשים`, inline: true },
          { name: '🚨 לא פעילים (30+ ימים):', value: `\`${stats.inactive30Days}\` משתמשים`, inline: true },
          { name: '\u200B', value: '\u200B' },
          { name: '❌ כשלון שליחת DM:', value: `\`${stats.failedDM}\` משתמשים`, inline: true },
          { name: '✅ הגיבו ל־DM:', value: `\`${stats.repliedDM}\` משתמשים`, inline: true },
          { name: '🗑️ משתמשים שהורחקו:', value: `\`${stats.kickedUsers}\` משתמשים`, inline: true }
        )
        .setFooter({ text: 'Shimon BOT — מערכת ניהול פעילות מתקדמת', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
}

/**
 * פונקציית עזר לבניית רכיבי ה-ActionRow עבור הפאנל הראשי.
 * @returns {import('discord.js').ActionRowBuilder[]}
 */
function buildMainPanelComponents() {
    const dmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('send_dm_batch_list')
          .setLabel('שלח תזכורת רגילה 📨')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('send_dm_batch_final_check')
          .setLabel('שלח תזכורת סופית 🚨')
          .setStyle(ButtonStyle.Danger)
    );

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('inactivity_action_select')
          .setPlaceholder('בחר פעולה מתקדמת או דוח מפורט ⬇️')
          .addOptions(
            { label: '📊 דוח סטטוס נוכחי (מפורט)', description: 'פילוח סטטוסים מקיף של כל המשתמשים', value: 'show_status_summary', emoji: '📈' },
            { label: '❌ רשימת משתמשים שנכשלה שליחת DM אליהם', description: 'משתמשים שלא ניתן היה לשלוח להם הודעה פרטית', value: 'show_failed_list', emoji: '🚫' },
            { label: '💬 רשימת משתמשים שהגיבו להודעות פרטיות', description: 'משתמשים ששיתפו פעולה לאחר קבלת DM', value: 'show_replied_list', emoji: '✅' },
            { label: '🗑️ הרחק משתמשים לא פעילים (בדיקה ואישור)', description: 'הסרה ידנית של משתמשים שסיימו את תהליך המעקב ולא הגיבו', value: 'kick_failed_users', emoji: '🛑' },
            { label: '⏱️ הצג לא פעילים 7+ ימים', description: 'רשימת משתמשים שלא נצפו בשרת 7 ימים ומעלה', value: 'inactive_7', emoji: '⏳' },
            { label: '⌛ הצג לא פעילים 14+ ימים', description: 'רשימת משתמשים שלא נצפו בשרת שבועיים ומעלה', value: 'inactive_14', emoji: '🗓️' },
            { label: '🛑 הצג לא פעילים 30+ ימים', description: 'רשימת משתמשים שלא נצפו בשרת חודש ומעלה', value: 'inactive_30', emoji: '⛔' }
          )
    );
    return [dmRow, selectRow];
}

/**
 * פונקציית עזר לבניית שדות מרובי עמודים עבור Embeds, בהתחשב במגבלות דיסקורד.
 * כל שדה יכול להכיל עד 1024 תווים.
 * @param {string} title - כותרת השדה.
 * @param {string[]} items - מערך של מחרוזות (שורות) להצגה בשדה.
 * @returns {Array<Object>} - מערך של אובייקטי שדות ל-Embed.
 */
function createPaginatedFields(title, items) {
    const fields = [];
    let currentContent = '';
    let pageNum = 1;
    const MAX_FIELD_LENGTH = 1024; // מגבלת תווים לשדה ב-Embed

    if (items.length === 0) {
        fields.push({ name: title, value: '— אין נתונים —', inline: false });
        return fields;
    }

    for (const item of items) {
        if (currentContent.length + item.length + 1 > MAX_FIELD_LENGTH) { // +1 עבור תו ירידת שורה
            fields.push({ name: `${title} (עמוד ${pageNum})`, value: currentContent, inline: false });
            currentContent = '';
            pageNum++;
        }
        currentContent += (currentContent ? '\n' : '') + item;
    }

    if (currentContent) {
        fields.push({ name: `${title} (עמוד ${pageNum})`, value: currentContent, inline: false });
    }

    return fields;
}
/**
 * פונקציית handler עבור תפריט הבחירה של ניהול אי-פעילות.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction - אובייקט האינטראקציה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
const execute = async (interaction, client) => {
  await interaction.deferReply({ ephemeral: true });

  const selectedValue = interaction.values?.[0];

  let users;
  let embed;

  if (selectedValue === 'show_replied_list') {
    users = await getRepliedDmUsers(client);
    if (!users.length) {
      return interaction.editReply({ content: 'אף אחד לא ענה ל־DM עדיין.', ephemeral: true });
    }
    embed = buildUserListEmbed('💬 משתמשים שהגיבו להודעה פרטית', users, 0x00cc99);
  } else if (selectedValue === 'show_failed_list') {
    users = await getFailedDmUsers(client);
    if (!users.length) {
      return interaction.editReply({ content: 'אין משתמשים שנכשל DM אליהם.', ephemeral: true });
    }
    embed = buildUserListEmbed('❌ משתמשים שנכשל DM אליהם', users, 0xff0000);
  } else if (selectedValue === 'show_status_summary') {
    const summary = await getMemberStatusSummary(client);
    embed = buildStatusSummaryEmbed(summary, client);
  } else if (selectedValue.startsWith('inactive_')) {
    const days = parseInt(selectedValue.split('_')[1]);
    users = await getInactiveUsersByDays(client, days);
    if (!users.length) {
      return interaction.editReply({ content: `אין משתמשים עם חוסר פעילות של ${days}+ ימים תחת ניטור.`, ephemeral: true });
    }
    embed = buildUserListEmbed(`${days}+ ימים ללא פעילות`, users, 0xe67e22, true);
  } else {
    await sendStaffLog(client, '⚠️ פעולת אינטראקציה לא ידועה (Select Menu)', `ערך לא מטופל בתפריט בחירה: \`${selectedValue}\`.`, 0xFFA500);
    return interaction.editReply({ content: 'פעולה לא ידועה או לא נתמכת בתפריט הבחירה.', ephemeral: true });
  }

  return interaction.editReply({ embeds: [embed], ephemeral: true });
};

const customId = (interaction) => {
  return interaction.customId === 'inactivity_action_select';
};

module.exports = {
  customId,
  execute,
  // ✅ ייצוא כל הפונקציות הנחוצות לקבצים אחרים
  getMemberStatusSummary,
  getInactiveUsersByDays,
  getFailedDmUsers,
  getRepliedDmUsers,
  getDetailedInactivityStats, // עבור commands/inactivity.js
  buildStatusSummaryEmbed,
  buildUserListEmbed,
  buildMainPanelEmbed, // עבור commands/inactivity.js
  buildMainPanelComponents, // עבור commands/inactivity.js
  createPaginatedFields,
};