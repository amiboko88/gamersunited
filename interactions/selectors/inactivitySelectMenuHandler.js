// 📁 interactions/selectors/inactivitySelectMenuHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/firebase');
const { sendStaffLog } = require('../../utils/staffLogger');
const { createPaginatedFields } = require('../../utils/embedUtils');

// --- פונקציית ליבה חדשה לאיסוף ועיבוד כל הנתונים (מותאם ל-DB המאוחד) ---
async function fetchAndProcessInactivityData(interaction) {
    const guild = interaction.guild;
    if (!guild) throw new Error("Guild not found from interaction.");

    // ✅ תיקון 1: קריאה מקולקשן users במקום memberTracking
    const allUsersSnapshot = await db.collection('users').get();
    
    // שליפת חברי השרת לזיכרון (Cache) לייעול ביצועים
    const members = await guild.members.fetch().catch(() => new Map());

    const processedData = {
        stats: { inactive7Days: 0, inactive14Days: 0, inactive30Days: 0, failedDM: 0, repliedDM: 0, kickedUsers: 0 },
        lists: { inactive7: [], inactive14: [], inactive30: [], failedDM: [], replied: [] },
        statusSummary: {},
    };

    const now = Date.now();

    for (const doc of allUsersSnapshot.docs) {
        const data = doc.data();
        const userId = doc.id;
        
        // ✅ תיקון 2: בדיקה אם המשתמש קיים בדיסקורד כרגע (פעיל בשרת)
        const member = members.get(userId);
        if (!member) continue; // אם הוא לא בשרת, לא סופרים אותו לסטטיסטיקה הזו

        // ✅ תיקון 3: גישה לשדות המקוננים במבנה החדש (users -> meta / tracking)
        // במקום data.lastActive נחפש ב-data.meta.lastActive
        const lastActiveISO = data.meta?.lastActive || data.tracking?.lastActivity || data.tracking?.joinedAt;
        const statusStage = data.tracking?.statusStage || 'active';
        
        // חישוב ימים ללא פעילות
        let daysInactive = 0;
        if (lastActiveISO) {
            const lastActiveTime = new Date(lastActiveISO).getTime();
            daysInactive = Math.floor((now - lastActiveTime) / (1000 * 60 * 60 * 24));
        }

        // סיווג לפי ימים (רק אם הוא לא בוט)
        if (!member.user.bot) {
            const userEntry = `<@${userId}> (${daysInactive} ימים)`;

            if (daysInactive >= 30) {
                processedData.stats.inactive30Days++;
                processedData.lists.inactive30.push(userEntry);
            } else if (daysInactive >= 14) {
                processedData.stats.inactive14Days++;
                processedData.lists.inactive14.push(userEntry);
            } else if (daysInactive >= 7) {
                processedData.stats.inactive7Days++;
                processedData.lists.inactive7.push(userEntry);
            }
        }

        // סיווג לפי סטטוס טיפול (Status Stage)
        if (statusStage === 'failed_dm') {
            processedData.stats.failedDM++;
            processedData.lists.failedDM.push(`<@${userId}>`);
        } else if (statusStage === 'active' && data.tracking?.lastAliveResponse) {
            // מישהו שהגיב לאחרונה
            processedData.stats.repliedDM++;
            processedData.lists.replied.push(`<@${userId}>`);
        }
    }

    return processedData;
}

/**
 * בונה Embed שמציג רשימת משתמשים בצורה מסודרת (עם דפדוף אם צריך)
 */
function buildUserListEmbed(title, userList, color, isPrivate = true) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: `סה"כ נמצאו: ${userList.length}` });

    if (!userList || userList.length === 0) {
        embed.setDescription("✅ אין משתמשים בקטגוריה זו.");
    } else {
        // שימוש בפונקציית העזר לחלוקה לשדות (מונע קריסה מעומס תווים)
        const fields = createPaginatedFields('רשימת משתמשים', userList);
        // הוספת השדות לאמבד (עד המגבלה של דיסקורד)
        fields.slice(0, 25).forEach(field => embed.addFields(field));
    }
    return embed;
}

/**
 * ה-Handler הראשי
 */
module.exports = {
    customId: (interaction) => {
        return interaction.customId === 'inactivity_action_select';
    },

    async execute(interaction, client) {
        // וידוא הרשאות
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '⛔ אין לך הרשאות לבצע פעולה זו.', flags: MessageFlags.Ephemeral });
        }

        // מניעת Timeout
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
                            { name: '🗓️ אזהרה בינונית (14+)', value: `${data.lists.inactive14.length}`, inline: true },
                            { name: '⛔ אזהרה סופית (30+)', value: `${data.lists.inactive30.length}`, inline: true },
                            { name: '❌ נכשלו (DM סגור)', value: `${data.lists.failedDM.length}`, inline: true },
                            { name: '✅ הגיבו לאזהרה', value: `${data.lists.replied.length}`, inline: true }
                        )
                        .setTimestamp();
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
                    // ✅ תיקון 4: הסרת interaction.client מהקריאה ללוגר
                    await sendStaffLog('⚠️ פעולת אינטראקציה לא מטופלת', `המשתמש ${interaction.user.tag} בחר בפעולה \`${selectedValue}\` שעדיין לא ממומשה.`, 0xFEE75C);
                    return interaction.editReply({ content: `הפעולה '${selectedValue}' עדיין בפיתוח.` });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("❌ שגיאה קריטית ב-inactivitySelectMenuHandler:", error);
            // ✅ תיקון 5: הסרת interaction.client מהקריאה ללוגר
            await sendStaffLog('❌ שגיאה בלוח ניהול', `שגיאה בעיבוד נתונים: ${error.message}`, 0xFF0000);
            await interaction.editReply({ content: 'אירעה שגיאה חמורה בעת עיבוד הנתונים.' });
        }
    }
};