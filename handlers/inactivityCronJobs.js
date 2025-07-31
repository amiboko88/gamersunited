// 📁 handlers/inactivityCronJobs.js
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/firebase');
const { sendStaffLog } = require('../utils/staffLogger');

// ייבוא הפונקציות הנחוצות
const { createPaginatedFields } = require('../interactions/selectors/inactivitySelectMenuHandler');
const { sendReminderDM } = require('../interactions/buttons/inactivityDmButtons');

const INACTIVITY_DAYS_FIRST_DM = 7;
const INACTIVITY_DAYS_FINAL_DM = 30;
let lastInactiveIds = []; 

/**
 * פונקציית עזר לעדכון סטטוס משתמש ב-Firebase.
 * @param {string} userId - ה-ID של המשתמש.
 * @param {object} updates - אובייקט עם השדות לעדכון.
 */
async function updateMemberStatus(userId, updates) {
    try {
        await db.collection('memberTracking').doc(userId).set(updates, { merge: true });
    } catch (error) {
        console.error(`[DB] ❌ Failed to update status for ${userId}: ${error.message}`);
    }
}

// --- פונקציות CRON ---

/**
 * משימת CRON: עדכון סטטוס אי-פעילות אוטומטי ושליחת דוח שינויים לערוץ הצוות.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
async function runAutoTracking(client) {
    const guildId = process.env.GUILD_ID;
    if (!guildId) {
        console.error('❌ GUILD_ID אינו מוגדר. לא ניתן להריץ runAutoTracking.');
        return;
    }
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    // --- ✅ התיקון היחיד נמצא כאן ---
    // הוספת force: true כדי למנוע את השגיאה GuildMembersTimeout
    const members = await guild.members.fetch({ force: true });
    
    const snapshot = await db.collection('memberTracking').get();
    const now = Date.now();
    const allInactive = [];
    const statusChanges = [];

    for (const doc of snapshot.docs) {
        const d = doc.data();
        const userId = doc.id;
        const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
        const days = Math.floor((now - last) / 86400000);
        const member = members.get(userId);

        if (!member || member.user.bot || userId === client.user.id || ['left', 'kicked'].includes(d.statusStage)) {
            if (!member && !['left', 'kicked'].includes(d.statusStage)) {
                await updateMemberStatus(userId, { statusStage: 'left', leftAt: new Date().toISOString() });
            }
            continue;
        }

        let currentStatus = d.statusStage || 'joined';
        let newStatus = currentStatus;

        if (days >= INACTIVITY_DAYS_FINAL_DM && ['dm_sent', 'waiting_dm', 'joined'].includes(currentStatus)) {
            newStatus = 'final_warning';
        } else if (days >= INACTIVITY_DAYS_FIRST_DM && currentStatus === 'joined') {
            newStatus = 'waiting_dm';
        } else if (d.replied && currentStatus !== 'responded') {
            newStatus = 'responded';
        } else if (days < INACTIVITY_DAYS_FIRST_DM && !['joined', 'responded'].includes(currentStatus)) {
            newStatus = 'active';
        }

        if (newStatus !== currentStatus) {
            await updateMemberStatus(userId, { statusStage: newStatus, statusUpdated: new Date().toISOString() });
            statusChanges.push(`• <@${userId}>: \`${currentStatus}\` ➡️ \`${newStatus}\``);
        }

        if (days >= INACTIVITY_DAYS_FIRST_DM && !['left', 'kicked', 'responded', 'active'].includes(newStatus)) {
            allInactive.push({ id: userId, days, tag: member.user.username, status: newStatus });
        }
    }

    if (statusChanges.length > 0) {
        const fields = createPaginatedFields('🔄 סיכום עדכוני סטטוס', statusChanges);
        await sendStaffLog(client, '📜 עדכון סטטוסים אוטומטי', `בוצעו ${statusChanges.length} עדכוני סטטוס.`, 0x3498db, fields);
    }

    const currentInactiveIds = allInactive.map(u => u.id).sort();
    const hasChanged = currentInactiveIds.length !== lastInactiveIds.length ||
                         currentInactiveIds.some((id, i) => id !== lastInactiveIds[i]);

    if (hasChanged) {
        lastInactiveIds = currentInactiveIds;

        const group1 = allInactive.filter(u => u.days >= 7 && u.days < 30);
        const group2 = allInactive.filter(u => u.days >= 30);

        const fields1 = createPaginatedFields('🕒 לא פעילים 7-29 ימים', group1.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));
        const fields2 = createPaginatedFields('🚨 לא פעילים 30+ ימים', group2.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));

        const allFields = [...fields1, ...fields2];
        
        if (allInactive.length > 0) {
            await sendStaffLog(client, '📢 דוח משתמשים לא פעילים', `זוהה שינוי ברשימה. סה"כ ${allInactive.length} משתמשים לא פעילים.`, 0xe67e22, allFields);
        }
    }
}

async function runScheduledReminders(client) {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    // --- ✅ התיקון היחיד נמצא כאן ---
    const members = await guild.members.fetch({ force: true });
    const allTracked = await db.collection('memberTracking').get();
    const success = [];
    const fails = [];

    for (const doc of allTracked.docs) {
        const d = doc.data();
        const userId = doc.id;
        const status = d.statusStage || 'joined';
        let shouldSend = false;
        let isFinal = false;

        if (status === 'waiting_dm') {
            shouldSend = true;
            isFinal = false;
        } else if (status === 'final_warning') {
            shouldSend = true;
            isFinal = true;
        }

        if (shouldSend) {
            const result = await sendReminderDM(client, guild, members, userId, isFinal);
            if (result.success) {
                success.push(`<@${userId}> (${isFinal ? 'סופי' : 'רגיל'})`);
            } else {
                fails.push(`<@${userId}> (${result.reason})`);
            }
        }
    }

    if (success.length > 0 || fails.length > 0) {
        const fields = [];
        if (success.length > 0) fields.push(createPaginatedFields('✅ נשלחו בהצלחה', success)[0]);
        if (fails.length > 0) fields.push(createPaginatedFields('❌ נכשלו', fails)[0]);
        await sendStaffLog(client, '📤 סיכום שליחת תזכורות אוטומטי', `הושלם סבב אוטומטי.`, 0x00aaff, fields);
    }
}

async function runMonthlyKickReport(client) {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const allTracked = await db.collection('memberTracking').get();
    const eligibleToKick = allTracked.docs.filter(doc => {
        const d = doc.data();
        return ['failed_dm', 'final_warning', 'final_warning_auto'].includes(d.statusStage || '') && d.statusStage !== 'left';
    });

    if (eligibleToKick.length === 0) {
        await sendStaffLog(client, '🗓️ דוח הרחקה חודשי', 'אין משתמשים העומדים בקריטריונים להרחקה החודש.', 0x00ff00);
        return;
    }

    const userLines = eligibleToKick.map(doc => `• <@${doc.id}> (סטטוס: \`${doc.data().statusStage}\`)`);
    const fields = createPaginatedFields(`מועמדים להרחקה (${eligibleToKick.length})`, userLines);

    await sendStaffLog(
        client,
        '🗓️ דוח הרחקה חודשי',
        'להלן המשתמשים שניתן להרחיק עקב אי-פעילות. לביצוע, השתמשו בפקודת `/ניהול` ובחרו באפשרות ההרחקה.',
        0xffa500,
        fields
    );
}

module.exports = {
    runAutoTracking,
    runScheduledReminders,
    runMonthlyKickReport,
};