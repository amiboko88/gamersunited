// 📁 handlers/inactivityCronJobs.js
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/firebase');
// ✅ אין צורך לייבא את sendStaffLog כאן כי היא תוגדר בתוך הקובץ עצמו
// const { sendStaffLog } = require('../utils/staffLogger'); 

const { createPaginatedFields } = require('../interactions/selectors/inactivitySelectMenuHandler');
const { sendReminderDM } = require('../interactions/buttons/inactivityDmButtons');
const { executeKickFailedUsers } = require('../interactions/buttons/inactivityKickButton'); // ייבוא פונקציית הרחקה

// 🚨 הגדר את ה-ID של ערוץ הצוות כאן
const STAFF_CHANNEL_ID = '881445829100060723'; // ה-ID הקבוע של ערוץ הצוות שלך

const INACTIVITY_DAYS = 7;
let lastInactiveIds = [];

// ✅ פונקציית sendStaffLog - הועברה לכאן במלואה
/**
 * שולח הודעת לוג לערוץ הצוות.
 * @param {import('discord.js').Client} client - אובייקט הקליינט.
 * @param {string} title - כותרת ההודעה.
 * @param {string} description - תוכן ההודעה.
 * @param {number} color - צבע האמבד (בפורמט הקסדצימלי, לדוגמה 0x00FF00).
 * @param {Array<Object>} [fields=[]] - מערך של שדות להוספה לאמבד.
 */
async function sendStaffLog(client, title, description, color, fields = []) {
    if (!STAFF_CHANNEL_ID) {
        console.error('⚠️ STAFF_CHANNEL_ID אינו מוגדר בקובץ inactivityCronJobs.js. לא ניתן לשלוח לוג צוות.');
        return;
    }

    try {
        const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID); 
        if (staffChannel) {
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .setTimestamp()
                .addFields(fields); // הוספת השדות
            await staffChannel.send({ embeds: [embed] });
            console.log(`✅ לוג צוות נשלח לערוץ ${staffChannel.name}: ${title}`);
        } else {
            console.error(`❌ לא ניתן למצוא את ערוץ הצוות (ID: ${STAFF_CHANNEL_ID}). דוח אי-פעילות לא נשלח לערוץ.`);
        }
    } catch (error) {
        console.error(`🛑 שגיאה בשליחת לוג צוות לערוץ ${STAFF_CHANNEL_ID}:`, error);
    }
}


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
  // log('🔍 מריץ עדכון סטטוס אי-פעילות אוטומטי...'); // ניתן להוסיף לוג התחלה
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
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
            await sendStaffLog(client, '🚪 משתמש עזב', `<@${userId}> עזב את השרת ונרשם כעזב במערכת.`, 0x808080);
        }
        continue;
    }

    let currentStatus = d.statusStage || 'joined';
    let newStatus = currentStatus;

    if (days >= 30 && currentStatus !== 'final_warning_auto' && currentStatus !== 'final_warning') {
        newStatus = 'final_warning_auto';
    } else if (days >= 14 && currentStatus === 'dm_sent') {
        newStatus = 'final_warning';
    } else if (days >= INACTIVITY_DAYS && currentStatus === 'joined') {
        newStatus = 'waiting_dm';
    } else if (currentStatus === 'waiting_dm' && days < INACTIVITY_DAYS) {
        newStatus = 'active';
    } else if (d.replied && currentStatus !== 'responded') {
        newStatus = 'responded';
    } else if (!d.dmFailed && !d.replied && days < INACTIVITY_DAYS && currentStatus !== 'joined') {
        newStatus = 'active';
    }


    if (newStatus !== currentStatus) {
        await updateMemberStatus(userId, { statusStage: newStatus, statusUpdated: new Date().toISOString() });
        statusChanges.push(`• <@${userId}>: \`${currentStatus}\` ➡️ \`${newStatus}\``);
    }

    if (days >= INACTIVITY_DAYS && !['left', 'kicked', 'responded', 'active'].includes(newStatus)) {
        allInactive.push({ id: userId, days, tag: member.user.username, status: newStatus });
    }
  }

  if (statusChanges.length > 0) {
      const fields = createPaginatedFields('🔄 סיכום עדכוני סטטוס', statusChanges);
      await sendStaffLog(client, '📜 עדכון סטטוסים אוטומטי', `בוצעו ${statusChanges.length} עדכוני סטטוס.`, 0x3498db, fields);
  }

  const currentInactiveIds = allInactive.map(u => u.id).sort();
  const changed = currentInactiveIds.length !== lastInactiveIds.length ||
                  currentInactiveIds.some((id, i) => id !== lastInactiveIds[i]);

  if (changed) {
    lastInactiveIds = currentInactiveIds;

    const group1 = allInactive.filter(u => u.days >= 7 && u.days <= 13);
    const group2 = allInactive.filter(u => u.days >= 14 && u.days <= 20);
    const group3 = allInactive.filter(u => u.days > 20);

    const fields1 = createPaginatedFields('🕒 7–13 ימים', group1.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));
    const fields2 = createPaginatedFields('⏳ 14–20 ימים', group2.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));
    const fields3 = createPaginatedFields('🚨 21+ ימים', group3.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));

    const allFields = [...fields1, ...fields2, ...fields3];

    const embeds = [];
    // ✅ שימוש ב-sendStaffLog במקום שליחה ישירה ל-staffChannel
    // הלוגיקה לשליחת האמבדים בערוץ הצוות תהיה בתוך sendStaffLog
    const reportTitle = allInactive.length > 0 ? '📢 דוח משתמשים לא פעילים' : '📢 דוח משתמשים לא פעילים (אין שינויים משמעותיים)';
    const reportColor = allInactive.length > 0 ? 0xe67e22 : 0x00FF00; // כתום אם יש לא פעילים, ירוק אם אין

    await sendStaffLog(client, reportTitle, `סה"כ ${allInactive.length} משתמשים לא פעילים.`, reportColor, allFields);
  }
}

/**
 * משימת CRON: שליחת תזכורות אוטומטיות למשתמשים לא פעילים.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
async function runScheduledReminders(client) {
  // log('🔍 מריץ שליחת תזכורות אוטומטיות...'); // ניתן להוסיף לוג התחלה
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
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


/**
 * משימת CRON: שליחת דוח חודשי למנהלים על מועמדים להרחקה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
async function runMonthlyKickReport(client) {
    // log('🔍 מריץ דוח הרחקה חודשי...'); // ניתן להוסיף לוג התחלה
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