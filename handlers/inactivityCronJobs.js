// 📁 handlers/inactivityCronJobs.js
const db = require('../utils/firebase'); // נתיב יחסי נכון ל-firebase.js
const { sendStaffLog } = require('../utils/staffLogger'); // נתיב יחסי נכון ל-staffLogger.js
const { createPaginatedFields } = require('../interactions/selectors/inactivitySelectMenuHandler'); // ✅ ייבוא פונקציה לבניית שדות מרובי עמודים
const { sendReminderDM } = require('../interactions/buttons/inactivityDmButtons'); // ✅ ייבוא פונקציית שליחת DM

const INACTIVITY_DAYS = 7;
let lastInactiveIds = []; // משתנה לניהול שינויים בדוחות

/**
 * פונקציית עזר לעדכון סטטוס משתמש ב-Firebase.
 * (זוהי גרסה מצומצמת יותר מזו שב-inactivityDmButtons.js, שכן היא לא מחזירה הצלחה/כישלון מפורט).
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
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const snapshot = await db.collection('memberTracking').get();
  const now = Date.now();
  const allInactive = [];
  const statusChanges = []; // מערך לאיסוף שינויים

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const userId = doc.id;
    const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
    const days = Math.floor((now - last) / 86400000);
    const member = members.get(userId);

    // טיפול במשתמשים שעזבו או בוטים
    if (!member || member.user.bot || userId === client.user.id || ['left', 'kicked'].includes(d.statusStage)) {
        if (!member && !['left', 'kicked'].includes(d.statusStage)) {
            // אם המשתמש לא בשרת ולא סומן כעזב/הורחק, עדכן סטטוס
            await updateMemberStatus(userId, { statusStage: 'left', leftAt: new Date().toISOString() });
            await sendStaffLog(client, '🚪 משתמש עזב', `<@${userId}> עזב את השרת ונרשם כעזב במערכת.`, 0x808080);
        }
        continue; // דלג על בוטים ומשתמשים שעזבו/הורחקו
    }

    let currentStatus = d.statusStage || 'joined';
    let newStatus = currentStatus;

    // עדכון סטטוסים לפי ימי אי-פעילות
    if (days >= 30 && currentStatus !== 'final_warning_auto' && currentStatus !== 'final_warning') {
        newStatus = 'final_warning_auto';
    } else if (days >= 14 && currentStatus === 'dm_sent') {
        newStatus = 'final_warning';
    } else if (days >= INACTIVITY_DAYS && currentStatus === 'joined') {
        newStatus = 'waiting_dm';
    } else if (currentStatus === 'waiting_dm' && days < INACTIVITY_DAYS) { // משתמש חזר לפעילות לפני DM
        newStatus = 'active';
    } else if (d.replied && currentStatus !== 'responded') { // משתמש הגיב ל-DM
        newStatus = 'responded';
    } else if (!d.dmFailed && !d.replied && days < INACTIVITY_DAYS && currentStatus !== 'joined') {
        // אם משתמש חזר להיות פעיל ואין לו כשלון DM והוא לא הגיב
        newStatus = 'active';
    }


    if (newStatus !== currentStatus) {
        await updateMemberStatus(userId, { statusStage: newStatus, statusUpdated: new Date().toISOString() });
        statusChanges.push(`• <@${userId}>: \`${currentStatus}\` ➡️ \`${newStatus}\``); // איסוף השינוי
    }

    // אסוף משתמשים "לא פעילים" לצורך דוח תקופתי (אם הסטטוס שלהם לא 'active', 'responded', 'left', 'kicked')
    if (days >= INACTIVITY_DAYS && !['left', 'kicked', 'responded', 'active'].includes(newStatus)) {
        allInactive.push({ id: userId, days, tag: member.user.username, status: newStatus });
    }
  }

  // שליחת לוג סיכום על שינויי סטטוס (אם היו)
  if (statusChanges.length > 0) {
      const fields = createPaginatedFields('🔄 סיכום עדכוני סטטוס', statusChanges);
      await sendStaffLog(client, '📜 עדכון סטטוסים אוטומטי', `בוצעו ${statusChanges.length} עדכוני סטטוס.`, 0x3498db, fields);
  }

  // שליחת דוח משתמשים לא פעילים רק אם היו שינויים משמעותיים ברשימה
  // (הלוגיקה של hasChanged מ memberButtons.js המקורי, ניתן לשמור כאן פנימית)
  const currentInactiveIds = allInactive.map(u => u.id).sort();
  const changed = currentInactiveIds.length !== lastInactiveIds.length ||
                  currentInactiveIds.some((id, i) => id !== lastInactiveIds[i]);

  if (changed) {
    lastInactiveIds = currentInactiveIds; // עדכן את רשימת המזהים

    const group1 = allInactive.filter(u => u.days >= 7 && u.days <= 13);
    const group2 = allInactive.filter(u => u.days >= 14 && u.days <= 20);
    const group3 = allInactive.filter(u => u.days > 20);

    const fields1 = createPaginatedFields('🕒 7–13 ימים', group1.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));
    const fields2 = createPaginatedFields('⏳ 14–20 ימים', group2.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));
    const fields3 = createPaginatedFields('🚨 21+ ימים', group3.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));

    const allFields = [...fields1, ...fields2, ...fields3];

    const embeds = [];
    // נחלק ל-Embeds נפרדים אם יש יותר מדי שדות
    for (let i = 0; i < allFields.length; i += 25) {
        const chunk = allFields.slice(i, i + 25);
        const embed = new EmbedBuilder()
          .setTitle(i === 0 ? '📢 דוח משתמשים לא פעילים' : `📢 דוח משתמשים לא פעילים (המשך)`)
          .setColor(0xe67e22)
          .setFooter({ text: `Shimon BOT – ${allInactive.length} לא פעילים` })
          .setTimestamp()
          .addFields(chunk);
        embeds.push(embed);
    }

    const staffChannel = client.channels.cache.get(process.env.STAFF_CHANNEL_ID);
    if (staffChannel) {
        for (const embed of embeds) {
            await staffChannel.send({ embeds: [embed] });
        }
    } else {
        console.warn(`[STAFF_LOG] ⚠️ ערוץ הצוות לא נמצא (ID: ${process.env.STAFF_CHANNEL_ID}). דוח אי-פעילות לא נשלח.`);
    }
  }
}

/**
 * משימת CRON: שליחת תזכורות אוטומטיות למשתמשים לא פעילים.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
async function runScheduledReminders(client) {
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

    // שלח תזכורת רגילה אם הסטטוס 'waiting_dm'
    if (status === 'waiting_dm') {
      shouldSend = true;
      isFinal = false;
    }
    // שלח תזכורת סופית אם הסטטוס 'final_warning'
    else if (status === 'final_warning') { // הסרנו d.dmSent כי הסטטוס כבר מצביע על כך
      shouldSend = true;
      isFinal = true;
    }

    if (shouldSend) {
      const result = await sendReminderDM(client, guild, members, userId, isFinal); // ✅ שימוש בפונקציה המיובאת
      if (result.success) {
        success.push(`<@${userId}> (${isFinal ? 'סופי' : 'רגיל'})`);
      } else {
        fails.push(`<@${userId}> (${result.reason})`);
      }
    }
  }

  if (success.length > 0 || fails.length > 0) {
      const fields = [];
      if (success.length > 0) fields.push(createPaginatedFields('✅ נשלחו בהצלחה', success)[0]); // [0] כדי לקבל את השדה הראשון
      if (fails.length > 0) fields.push(createPaginatedFields('❌ נכשלו', fails)[0]); // [0] כדי לקבל את השדה הראשון

      await sendStaffLog(client, '📤 סיכום שליחת תזכורות אוטומטי', `הושלם סבב אוטומטי.`, 0x00aaff, fields);
  }
}


/**
 * משימת CRON: שליחת דוח חודשי למנהלים על מועמדים להרחקה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
async function runMonthlyKickReport(client) {
    const allTracked = await db.collection('memberTracking').get();
    const eligibleToKick = allTracked.docs.filter(doc => {
        const d = doc.data();
        // מועמדים להרחקה: מי שנכשלה שליחת DM, או קיבל אזהרה סופית (אוטומטית או ידנית), ולא עזב.
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