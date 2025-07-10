// 📁 handlers/memberButtons.js (הגרסה המלאה והמתוקנת עם סיכום לוגים ודוח חודשי)
const db = require('../utils/firebase');
const { EmbedBuilder, Collection, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const smartChat = require('./smartChat');
const { sendStaffLog } = require('../utils/staffLogger');

const INACTIVITY_DAYS = 7; 
let lastInactiveIds = [];

// --- פונקציות עזר ---

function hasChanged(current) {
  const ids = current.map(u => u.id).sort();
  const changed = ids.length !== lastInactiveIds.length ||
    ids.some((id, i) => id !== lastInactiveIds[i]);

  if (changed) lastInactiveIds = ids;
  return changed;
}

/**
 * 💡 פונקציית עזר חדשה לפיצול רשימות ארוכות לשדות Embed תקינים
 * @param {string} title - כותרת השדה (למשל '🚨 21+ ימים')
 * @param {string[]} lines - מערך של שורות טקסט (למשל רשימת משתמשים)
 * @returns {import('discord.js').EmbedField[]} - מערך של שדות תקינים ל-Embed
 */
function createPaginatedFields(title, lines) {
    if (!lines.length) {
        return [{ name: title, value: '—', inline: false }];
    }

    const fields = [];
    let currentDescription = '';

    for (const line of lines) {
        if (currentDescription.length + line.length + 2 > 1024) {
            fields.push({ 
                name: fields.length === 0 ? title : `${title} (המשך)`, 
                value: currentDescription, 
                inline: false 
            });
            currentDescription = '';
        }
        currentDescription += `${line}\n`;
    }

    fields.push({ 
        name: fields.length === 0 ? title : `${title} (המשך)`, 
        value: currentDescription, 
        inline: false 
    });

    return fields;
}

async function updateMemberStatus(userId, updates) {
  try {
    await db.collection('memberTracking').doc(userId).set(updates, { merge: true });
    return true;
  } catch (error) {
    console.error(`[DB] ❌ Failed to update status for ${userId}: ${error.message}`);
    return false;
  }
}

// ✅ פונקציה מעודכנת שמחזירה אובייקט עם תוצאה
async function sendReminderDM(client, guild, members, userId, isFinal = false) {
  const docRef = db.collection('memberTracking').doc(userId);
  const doc = await docRef.get();
  const d = doc.exists ? doc.data() : {};
  const now = Date.now();
  const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
  const daysInactive = Math.floor((now - last) / 86400000);

  const memberReal = members.get(userId) || await guild.members.fetch(userId).catch(() => null);
  const user = memberReal?.user || await client.users.fetch(userId).catch(() => null);
  if (!user || typeof user.send !== 'function') {
      await updateMemberStatus(userId, { dmFailed: true, dmFailedAt: new Date().toISOString(), statusStage: 'failed_dm' });
      return { success: false, reason: 'No user object or cannot send DMs' };
  }

  const fakeMessage = {
    content: '',
    author: { id: user.id, username: user.username, avatar: user.avatar, bot: user.bot },
    member: memberReal || { displayName: user.username, permissions: { has: () => false }, roles: { cache: new Collection() } },
    channel: { id: '000' },
    client,
    _simulateOnly: true
  };

  const prompt = `${user.username} לא היה פעיל כבר ${daysInactive} ימים.\n` +
    `${isFinal ? 'זוהי תזכורת סופית' : 'זו תזכורת רגילה'}.\n` +
    `כתוב לו הודעה ${isFinal ? 'ישירה וקשוחה' : 'חברית ומעודדת'}, שתעודד אותו להשתתף בשרת.\n` +
    `הסבר לו שהוא עבר אימות אך עדיין לא לקח חלק.`;
  fakeMessage.content = prompt;

  let dm;
  try {
    dm = await smartChat.smartRespond(fakeMessage, isFinal ? 'קשוח' : 'רגיש');
  } catch (err) {
    return { success: false, reason: `SmartChat Error: ${err.message}`};
  }

  if (!dm || typeof dm !== 'string' || dm.length < 2) {
      return { success: false, reason: 'SmartChat returned empty response'};
  }

  try {
    await user.send(dm);
    const updates = { dmSent: true, dmSentAt: new Date().toISOString(), reminderCount: isFinal ? (d.reminderCount || 0) + 1 : 1, statusStage: isFinal ? 'final_warning' : 'dm_sent' };
    await updateMemberStatus(userId, updates);
    return { success: true };
  } catch (err) {
    // השארנו את הלוגיקה המקורית שלך עם כפתור ה-fallback
    try {
      const fallbackButton = new ButtonBuilder().setCustomId('dm_fallback_reply').setLabel('💬 שלח תגובה לשמעון').setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(fallbackButton);
      const dmChan = await user.createDM();
      await dmChan.send({ content: '📬 לא הצלחנו לשלוח הודעה רשמית. תוכל להשיב כאן:', components: [row] });
    } catch (fallbackErr) {
        // כישלון גם ב-fallback
    }
    await updateMemberStatus(userId, { dmFailed: true, dmFailedAt: new Date().toISOString(), statusStage: 'failed_dm' });
    return { success: false, reason: `Direct DM Failed: ${err.message}`};
  }
}

// ✅ פונקציה מעודכנת עם לוגי סיכום
async function startAutoTracking(client) {
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
    if (!member || member.user.bot || userId === client.user.id || ['left', 'kicked'].includes(d.statusStage)) {
        if (!member && !['left', 'kicked'].includes(d.statusStage)) {
            await updateMemberStatus(userId, { statusStage: 'left', leftAt: new Date().toISOString() });
            // זהו לוג חשוב, נשאיר אותו - הוא לא קורה בתדירות גבוהה
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
    }

    if (newStatus !== currentStatus) {
        await updateMemberStatus(userId, { statusStage: newStatus, statusUpdated: new Date().toISOString() });
        statusChanges.push(`• <@${userId}>: \`${currentStatus}\` ➡️ \`${newStatus}\``); // איסוף השינוי
    }

    if (days >= INACTIVITY_DAYS && !['left', 'kicked', 'responded', 'active'].includes(newStatus)) {
        allInactive.push({ id: userId, days, tag: member.user.username, status: newStatus });
    }
  }

  // שליחת לוג סיכום על שינויי סטטוס
  if (statusChanges.length > 0) {
      const fields = createPaginatedFields('🔄 סיכום עדכוני סטטוס', statusChanges);
      await sendStaffLog(client, '📜 עדכון סטטוסים אוטומטי', `בוצעו ${statusChanges.length} עדכוני סטטוס.`, 0x3498db, fields);
  }

  if (hasChanged(allInactive)) {
    const group1 = allInactive.filter(u => u.days >= 7 && u.days <= 13);
    const group2 = allInactive.filter(u => u.days >= 14 && u.days <= 20);
    const group3 = allInactive.filter(u => u.days > 20);
    
    const fields1 = createPaginatedFields('🕒 7–13 ימים', group1.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));
    const fields2 = createPaginatedFields('⏳ 14–20 ימים', group2.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));
    const fields3 = createPaginatedFields('🚨 21+ ימים', group3.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`));
    
    const allFields = [...fields1, ...fields2, ...fields3];
    
    const embeds = [];
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
    }
  }
}// ✅ פונקציה מעודכנת עם לוגי סיכום
async function sendScheduledReminders(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const allTracked = await db.collection('memberTracking').get();
  const now = Date.now();
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
    else if (status === 'final_warning' && d.dmSent) {
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
      if (success.length > 0) fields.push(...createPaginatedFields('✅ נשלחו בהצלחה', success));
      if (fails.length > 0) fields.push(...createPaginatedFields('❌ נכשלו', fails));
      await sendStaffLog(client, '📤 סיכום שליחת תזכורות', `הושלם סבב אוטומטי.`, 0x00aaff, fields);
  }
}

async function kickFailedUsers(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const allTracked = await db.collection('memberTracking').get();
  let count = 0;
  let notInGuild = [];
  let failedKick = [];
  let kickedList = [];
  const eligibleToKick = allTracked.docs.filter(doc => {
    const d = doc.data();
    return ['failed_dm', 'final_warning', 'final_warning_auto'].includes(d.statusStage || '') && d.statusStage !== 'left';
  });

  for (const doc of eligibleToKick) {
    const userId = doc.id;
    const member = members.get(userId);
    if (!member) {
      notInGuild.push(`<@${userId}>`);
      await db.collection('memberTracking').doc(userId).delete();
      await sendStaffLog(client, '🧹 ניקוי משתמש (לא בשרת)', `המשתמש <@${userId}> לא נמצא בשרת ונמחק ממעקב הפעילות.`, 0x808080);
      continue;
    }
    try {
      await member.kick('בעיטה לפי סטטוס – לא פעיל + חסום + לא הגיב');
      await db.collection('memberTracking').doc(userId).delete();
      kickedList.push(`<@${userId}>`);
      count++;
      await sendStaffLog(client, '👢 משתמש הורחק', `המשתמש <@${userId}> הורחק מהשרת בהצלחה.`, 0xFF3300, [{ name: 'סיבה', value: 'לא פעיל + חסום + לא הגיב' }]);
    } catch (err) {
      failedKick.push(`<@${userId}>`);
      await sendStaffLog(client, '❌ כשל בהרחקה', `נכשל ניסיון הרחקת המשתמש <@${userId}>: \`\`\`${err.message}\`\`\``, 0xFF0000);
    }
  }
  return { count, kickedList, notInGuild, failedKick };
}


/**
 * 💡 פונקציה חדשה: דוח חודשי למנהלים על מועמדים להרחקה
 */
async function sendMonthlyKickReport(client) {
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

async function handleMemberButtons(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const value = interaction.values?.[0];
  const action = interaction.customId === 'inactivity_action_select' ? value : interaction.customId;

  if (action === 'send_dm_batch_list' || action === 'send_dm_batch_final_check') {
    await sendScheduledReminders(client);
    return interaction.editReply({ content: '📤 סבב תזכורות ידני הורץ. סיכום יישלח לערוץ הצוות.', ephemeral: true });
  }
  
  if (action === 'kick_failed_users') {
    const { count, kickedList, notInGuild, failedKick } = await kickFailedUsers(client);
    const embed = new EmbedBuilder()
      .setTitle('🛑 סיכום פעולת הרחקת משתמשים')
      .setDescription(`**הושלמה פעולת הרחקה ידנית.**`)
      .addFields(
          { name: `👢 הורחקו בהצלחה`, value: `**${count}**\n${kickedList.length ? kickedList.join('\n') : '—'}`, inline: false },
          { name: `🚫 לא בשרת (נמחקו מהמעקב)`, value: `**${notInGuild.length}**\n${notInGuild.length ? notInGuild.join('\n') : '—'}`, inline: false },
          { name: `⚠️ נכשלו בהרחקה`, value: `**${failedKick.length}**\n${failedKick.length ? failedKick.join('\n') : '—'}`, inline: false }
       )
      .setColor(0xff3300)
      .setTimestamp();
    await client.channels.cache.get(process.env.STAFF_CHANNEL_ID).send({ embeds: [embed] });
    return interaction.editReply({ content: '✅ הפעולה בוצעה. סיכום נשלח לצוות.', ephemeral: true });
  }

  const allTracked = await db.collection('memberTracking').get();
  
  if (action === 'show_replied_list') {
    const replied = allTracked.docs.filter(doc => doc.data().replied);
    if (!replied.length) {
      return interaction.editReply({ content: 'אף אחד לא ענה ל־DM עדיין.', ephemeral: true });
    }
    const embed = new EmbedBuilder().setTitle('משתמשים שהגיבו להודעה פרטית 💬').setDescription(replied.map(doc => `<@${doc.id}>`).join(', ')).setColor(0x00cc99);
    return interaction.editReply({ embeds: [embed], ephemeral: true });
  }

  if (action === 'show_failed_list') {
    const failedUsers = allTracked.docs.filter(doc => doc.data().dmFailed);
    if (!failedUsers.length) {
      return interaction.editReply({ content: 'אין משתמשים שנכשל DM אליהם.', ephemeral: true });
    }
    const embed = new EmbedBuilder().setTitle('❌ משתמשים שנכשל DM אליהם').setDescription(failedUsers.map(doc => `<@${doc.id}>`).join(', ')).setColor(0xff0000);
    return interaction.editReply({ embeds: [embed], ephemeral: true });
  }

  if (action === 'show_status_summary') {
    const summary = {};
    for (const doc of allTracked.docs) {
      const status = doc.data().statusStage || 'unknown';
      summary[status] = (summary[status] || 0) + 1;
    }
    const statusMap = { joined: '🆕 הצטרף', waiting_activity: '⌛ מחכה לפעולה', active: '✅ פעיל', dm_sent: '📩 תזכורת נשלחה', final_warning: '🔴 תזכורת סופית', final_warning_auto: '🚨 אזהרה סופית (אוטומטי)', responded: '💬 ענה ל-DM', kicked: '🚫 נבעט', failed_dm: '❌ נכשל DM', left: '🚪 עזב את השרת', unknown: '❓ לא ידוע' };
    const fields = Object.entries(summary).map(([key, val]) => ({ name: statusMap[key] || key, value: `**${val}** משתמשים`, inline: true }));
    const embed = new EmbedBuilder().setTitle('📊 סטטוס נוכחי של משתמשים').addFields(fields).setColor(0x3498db).setFooter({ text: 'Shimon BOT – לפי statusStage' }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }
  
  if (action.startsWith('inactive_')) {
    const days = parseInt(action.split('_')[1]);
    const now = Date.now();
    const matches = [];
    const members = await interaction.guild.members.fetch();
    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
      const inactiveDays = (now - last) / 86400000;
      const member = members.get(userId);
      const isBot = member?.user?.bot || userId === client.user.id;
      if (inactiveDays >= days && !['left', 'kicked', 'responded', 'active'].includes(d.statusStage) && !isBot) {
        matches.push(doc);
      }
    }
    if (!matches.length) {
      return interaction.editReply({ content: `אין משתמשים עם חוסר פעילות של ${days}+ ימים תחת ניטור.`, ephemeral: true });
    }
    const embed = new EmbedBuilder().setTitle(`${days}+ ימים ללא פעילות`).setDescription(matches.map(doc => `• <@${doc.id}> (סטטוס: ${doc.data().statusStage || 'לא ידוע'})`).join('\n').slice(0, 4000)).setColor(0xe67e22).setFooter({ text: `Shimon BOT – ניטור פעילות • ${matches.length} משתמשים` });
    return interaction.editReply({ embeds: [embed], ephemeral: true });
  }

  await sendStaffLog(client, '⚠️ פעולת אינטראקציה לא ידועה', `פעולת אינטראקציה לא מטופלת: \`${action}\`.`, 0xFFA500);
  return interaction.editReply({ content: 'פעולה לא ידועה או לא נתמכת.', ephemeral: true });
}

module.exports = {
  handleMemberButtons,
  startAutoTracking,
  sendScheduledReminders,
  kickFailedUsers,
  sendMonthlyKickReport // ✅ ייצוא הפונקציה החדשה
};