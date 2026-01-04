// 📁 interactions/selectors/inactivitySelectMenuHandler.js
const { MessageFlags } = require('discord.js');
const db = require('../../utils/firebase');
const { sendStaffLog } = require('../../utils/staffLogger');
const { createPaginatedFields } = require('../../utils/embedUtils');
const { EmbedBuilder } = require('discord.js');

/**
 * פונקציית ליבה לאיסוף ועיבוד נתונים מה-DB המאוחד
 */
async function fetchAndProcessInactivityData(interaction) {
    const guild = interaction.guild;
    if (!guild) throw new Error("Guild not found.");

    // שליפה של כל המשתמשים שיש להם מידע מעקב
    // (בסקייל ענק עדיף אינדקסים, כרגע נשלוף ונסנן בזיכרון)
    const snapshot = await db.collection('users').get();
    
    // ניסיון לשלוף את ה-Cache של השרת לביצועים מהירים
    const members = guild.members.cache;

    const lists = {
        inactive7: [],
        inactive14: [], // אופציונלי - מחושב לפי תאריך
        inactive30: [],
        failedDM: [],
        replied: []
    };

    const now = Date.now();

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const userId = doc.id;
        const tracking = data.tracking || {};
        
        // סינון: מתעלמים ממי שעזב
        if (tracking.status === 'left') continue;

        // חישוב ימים ללא פעילות (במידה ואין statusStage מוגדר)
        const lastActive = new Date(data.meta?.lastActive || tracking.joinedAt || now);
        const diffDays = Math.floor((now - lastActive) / (1000 * 60 * 60 * 24));

        // סיווג לפי סטטוסים ב-DB או לפי זמן
        if (tracking.statusStage === 'first_warning_sent' || (diffDays >= 7 && diffDays < 30)) {
            lists.inactive7.push(`<@${userId}> (${diffDays} יום)`);
        }
        
        if (diffDays >= 14 && diffDays < 30) {
            lists.inactive14.push(`<@${userId}> (${diffDays} יום)`);
        }

        if (tracking.statusStage === 'final_warning_auto' || diffDays >= 30) {
            lists.inactive30.push(`<@${userId}> (${diffDays} יום)`);
        }

        if (tracking.statusStage === 'failed_dm') {
            lists.failedDM.push(`<@${userId}> (DM חסום)`);
        }
        
        // בדיקה אם הגיב (לפי לוג ההיסטוריה או שדה ספציפי)
        if (tracking.lastAliveResponse) {
             // אופציונלי להציג כאן, כרגע נשאיר ריק כדי לא להעמיס
        }
    }

    return { lists };
}

/**
 * בונה את האמבד לתצוגה
 */
function buildUserListEmbed(title, userList, color, isActionable = false) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: `סה"כ: ${userList.length} משתמשים` });

    if (!userList || userList.length === 0) {
        embed.setDescription('✅ אין משתמשים בקטגוריה זו.');
    } else {
        // שימוש בפונקציית העזר לחלוקה לעמודים (מציג רק את הראשונים באמבד בודד)
        const fields = createPaginatedFields('משתמשים', userList);
        // מוסיף רק את השדות הראשונים כדי לא לחרוג
        embed.addFields(fields.slice(0, 5).flat()); 
        
        if (userList.length > 20) {
            embed.setDescription(`⚠️ הרשימה ארוכה (${userList.length}), מציג חלקית.`);
        }
    }
    
    return embed;
}

const customId = (interaction) => {
    return interaction.customId === 'inactivity_action_select';
};

const execute = async (interaction, client) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const selectedValue = interaction.values[0];
        const data = await fetchAndProcessInactivityData(interaction);
        let embed;

        switch (selectedValue) {
            case 'show_stats':
                embed = new EmbedBuilder()
                    .setTitle('📊 סטטיסטיקת אי-פעילות (Live DB)')
                    .setColor('#3498db')
                    .addFields(
                        { name: '⏳ אזהרה ראשונה (7+)', value: `${data.lists.inactive7.length}`, inline: true },
                        { name: '⛔ אזהרה סופית (30+)', value: `${data.lists.inactive30.length}`, inline: true },
                        { name: '❌ נכשלו (DM סגור)', value: `${data.lists.failedDM.length}`, inline: true }
                    );
                break;

            case 'inactive_7':
                embed = buildUserListEmbed('⏳ 7+ ימים ללא פעילות', data.lists.inactive7, '#F1C40F');
                break;
            case 'inactive_14':
                embed = buildUserListEmbed('🗓️ 14+ ימים ללא פעילות', data.lists.inactive14, '#E67E22');
                break;
            case 'inactive_30':
                embed = buildUserListEmbed('⛔ 30+ ימים ללא פעילות', data.lists.inactive30, '#992D22');
                break;
            case 'failed_dm':
                embed = buildUserListEmbed('❌ נכשלו בשליחה (DM חסום)', data.lists.failedDM, '#95a5a6');
                break;

            default:
                return interaction.editReply({ content: 'פעולה לא מוכרת.', flags: MessageFlags.Ephemeral });
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error("❌ Error in inactivitySelectMenuHandler:", error);
        await interaction.editReply({ content: '❌ שגיאה בשליפת הנתונים מה-DB המאוחד.', flags: MessageFlags.Ephemeral });
    }
};

module.exports = { customId, execute };