// 📁 handlers/inactivityCronJobs.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/firebase');
const { sendStaffLog } = require('../utils/staffLogger');
const { createPaginatedFields } = require('../utils/embedUtils');

// הוסר הייבוא שיצר את המעגל:
// const { sendReminderDM } = require('../interactions/buttons/inactivityDmButtons');

const INACTIVITY_DAYS_FIRST_DM = 7;
const INACTIVITY_DAYS_FINAL_DM = 30;

// פונקציה בטוחה לשליפת חברים
async function safeFetchMembers(guild) {
    try {
        return await guild.members.fetch({ time: 120000 }); 
    } catch (error) {
        console.warn(`[AutoTracking] ⚠️ Timeout במשיכת חברים. משתמש ב-Cache.`);
        return guild.members.cache;
    }
}

/**
 * ✅ פונקציה שהועברה לכאן כדי למנוע Circular Dependency
 * שולח הודעת תזכורת למשתמש
 */
async function sendReminderDM(client, userId, type) {
  try {
    const user = await client.users.fetch(userId);
    const isFinal = type === 'final_warning';

    const embed = new EmbedBuilder()
      .setTitle(isFinal ? '🚨 התראה אחרונה לפני הרחקה' : '👋 היי, נעלמת לנו!')
      .setDescription(isFinal 
        ? 'שמנו לב שאתה לא פעיל בשרת כבר תקופה ארוכה ולא הגבת להודעות קודמות.\nאם לא תהיה פעיל בימים הקרובים, המערכת תאלץ להסיר אותך כדי לפנות מקום.'
        : 'אנחנו עושים סדר בשרת ושמנו לב שלא היית פעיל הרבה זמן.\nאתה עדיין איתנו? תן סימן חיים בצ\'אט או בחדרים הקוליים! 🎮')
      .setColor(isFinal ? 0xFF0000 : 0xFFA500)
      .setFooter({ text: 'Gamers United Bot • ניהול קהילה' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('i_am_alive')
        .setLabel('אני כאן! אל תמחק אותי')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🙋‍♂️')
    );

    await user.send({ embeds: [embed], components: [row] });
    return true;
  } catch (e) {
    return false; // DM חסום
  }
}

/**
 * רץ פעם ביום: בודק מי לא פעיל ושולח הודעות
 */
async function runAutoTracking(client) {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    // שליפה מה-DB המאוחד
    const snapshot = await db.collection('users')
        .where('tracking.status', '!=', 'left') 
        .get();
        
    if (snapshot.empty) return;

    const now = new Date();
    const membersMap = await safeFetchMembers(guild);
    
    let success = [];
    let fails = [];

    for (const doc of snapshot.docs) {
        const userData = doc.data();
        const userId = doc.id;
        const tracking = userData.tracking || {};
        
        const member = membersMap.get(userId);
        if (!member || member.user.bot) continue;

        const lastActiveDate = new Date(userData.meta?.lastActive || tracking.joinedAt || now);
        const diffTime = Math.abs(now - lastActiveDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const currentStage = tracking.statusStage || 'active';

        // שימוש בפונקציה המקומית sendReminderDM
        if (diffDays >= INACTIVITY_DAYS_FIRST_DM && currentStage === 'active') {
            const sent = await sendReminderDM(client, userId, 'first_warning');
            if (sent) {
                success.push(`<@${userId}> (יום ${diffDays}) - אזהרה 1`);
                await doc.ref.update({ 'tracking.statusStage': 'first_warning_sent' });
            } else {
                fails.push(`<@${userId}> (DM חסום)`);
                await doc.ref.update({ 'tracking.statusStage': 'failed_dm' });
            }
        }
        else if (diffDays >= INACTIVITY_DAYS_FINAL_DM && currentStage === 'first_warning_sent') {
            const sent = await sendReminderDM(client, userId, 'final_warning');
            if (sent) {
                success.push(`<@${userId}> (יום ${diffDays}) - אזהרה סופית`);
                await doc.ref.update({ 'tracking.statusStage': 'final_warning_auto' });
            } else {
                fails.push(`<@${userId}> (DM חסום - סופי)`);
                await doc.ref.update({ 'tracking.statusStage': 'failed_dm' });
            }
        }
    }

    if (success.length > 0 || fails.length > 0) {
        const fields = [];
        if (success.length > 0) fields.push(createPaginatedFields('✅ נשלחו בהצלחה', success)[0]);
        if (fails.length > 0) fields.push(createPaginatedFields('❌ נכשלו', fails)[0]);
        await sendStaffLog('📤 דוח אי-פעילות יומי', `סריקה הושלמה.`, 0x00aaff, fields);
    }
}

async function runMonthlyKickReport(client) {
    const snapshot = await db.collection('users')
        .where('tracking.statusStage', 'in', ['failed_dm', 'final_warning_auto'])
        .get();

    if (snapshot.empty) {
        await sendStaffLog('🗓️ דוח הרחקה חודשי', 'אין משתמשים להרחקה החודש.', 0x00ff00);
        return;
    }

    const eligibleToKick = snapshot.docs.map(doc => {
        const d = doc.data();
        return `• <@${doc.id}> (סטטוס: ${d.tracking?.statusStage})`;
    });

    const fields = createPaginatedFields('💀 מועמדים להרחקה', eligibleToKick);
    await sendStaffLog('🗓️ דוח הרחקה חודשי', 'להלן המשתמשים שלא הגיבו או חסמו את הבוט:', 0xff0000, fields);
}

// ייצוא הפונקציה sendReminderDM כדי שקבצים אחרים יוכלו להשתמש בה
module.exports = { runAutoTracking, runMonthlyKickReport, sendReminderDM };