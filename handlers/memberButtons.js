const db = require('../utils/firebase');
const { EmbedBuilder, Collection, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const smartChat = require('./smartChat');
const { sendStaffLog } = require('../utils/staffLogger');

// STAFF_CHANNEL_ID ינוהל עכשיו דרך botLifecycle או קובץ קונפיגורציה מרכזי.
// INACTIVITY_DAYS כנ"ל.
const INACTIVITY_DAYS = 7; // השארנו כאן רק לצורך חישוב, אבל כדאי לשקול להעביר לקונפיג

let lastInactiveIds = [];

function hasChanged(current) {
  const ids = current.map(u => u.id).sort();
  const changed = ids.length !== lastInactiveIds.length ||
    ids.some((id, i) => id !== lastInactiveIds[i]);

  if (changed) lastInactiveIds = ids;
  return changed;
}

// פונקציה מעודכנת לטיפול בסטטוסים ב-Firebase
async function updateMemberStatus(userId, updates) {
  try {
    await db.collection('memberTracking').doc(userId).set(updates, { merge: true });
    return true;
  } catch (error) {
    console.error(`[DB] ❌ Failed to update status for ${userId}: ${error.message}`);
    return false;
  }
}

async function startAutoTracking(client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const snapshot = await db.collection('memberTracking').get();

  const now = Date.now();
  const allInactive = [];

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const userId = doc.id;
    const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
    const days = Math.floor((now - last) / 86400000);

    const member = members.get(userId);
    // התעלם מבוטים ומהבוט עצמו. התעלם ממי שכבר עזב/נבעט.
    if (!member || member.user.bot || userId === client.user.id || ['left', 'kicked'].includes(d.statusStage)) {
        // אם המשתמש כבר לא בשרת, נעדכן את הסטטוס שלו
        if (!member && !['left', 'kicked'].includes(d.statusStage)) {
            await updateMemberStatus(userId, { statusStage: 'left', leftAt: new Date().toISOString() });
            await sendStaffLog(client,
              '🚪 משתמש עזב',
              `<@${userId}> עזב את השרת ונרשם כעזב במערכת.`,
              0x808080
            );
        }
        continue;
    }


    // אוטומציה: עדכון statusStage אם הגיע למצב לא פעיל מספיק זמן
    let currentStatus = d.statusStage || 'joined';
    let newStatus = currentStatus;

    if (days >= 30 && currentStatus !== 'final_warning') { // למקרה שלא נשלח DM סופי והגיע ל-30 יום
        newStatus = 'final_warning_auto'; // סטטוס חדש לזיהוי אוטומטי
    } else if (days >= 14 && currentStatus === 'dm_sent') { // עבר שבועיים מה-DM הראשון ולא הגיב
        newStatus = 'final_warning';
    } else if (days >= INACTIVITY_DAYS && currentStatus === 'joined') { // לא פעיל 7+ ימים ולא נשלח DM
        newStatus = 'waiting_dm'; // שינוי ל-waiting_dm במקום dm_sent ישירות כדי להבדיל
    } else if (currentStatus === 'waiting_dm' && days < INACTIVITY_DAYS) { // חזר להיות פעיל לפני DM
        newStatus = 'active';
    }

    if (newStatus !== currentStatus) {
        await updateMemberStatus(userId, { statusStage: newStatus, statusUpdated: new Date().toISOString() });
        await sendStaffLog(client,
            '🔄 עדכון סטטוס משתמש',
            `<@${userId}>: ${currentStatus} ➡️ ${newStatus} (ימי אי פעילות: ${days})`,
            0x3498db,
            [{ name: 'פרטים', value: `הסטטוס של ${member.user.username} עודכן אוטומטית.` }]
        );
    }

    // הוסף לרשימת הלא פעילים רק אם לא עזב/נבעט, וכבר הגיע לסף מסוים (לצורך דיווח)
    if (days >= INACTIVITY_DAYS && !['left', 'kicked', 'responded', 'active'].includes(newStatus)) {
        allInactive.push({ id: userId, days, tag: member.user.username, status: newStatus });
    }
  }

  // רק אם היו שינויים ברשימת הלא פעילים או בסטטוסים, שלח הודעה לצוות
  // השתמש ב-allInactive המסוננים עבור hasChanged
  if (hasChanged(allInactive)) {
    const group1 = allInactive.filter(u => u.days >= 7 && u.days <= 13);
    const group2 = allInactive.filter(u => u.days >= 14 && u.days <= 20);
    const group3 = allInactive.filter(u => u.days > 20);

    const embed = new EmbedBuilder()
      .setTitle('📢 משתמשים לא פעילים לחלוטין (עדכון אוטומטי)')
      .addFields(
        {
          name: '🕒 7–13 ימים',
          value: group1.length ? group1.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`).join('\n') : '—',
          inline: false
        },
        {
          name: '⏳ 14–20 ימים',
          value: group2.length ? group2.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`).join('\n') : '—',
          inline: false
        },
        {
          name: '🚨 21+ ימים',
          value: group3.length ? group3.map(u => `• <@${u.id}> – ${u.days} ימים (סטטוס: ${u.status})`).join('\n') : '—',
          inline: false
        }
      )
      .setColor(0xe67e22)
      .setFooter({ text: `Shimon BOT – זיהוי משתמשים לא פעילים (${allInactive.length})` })
      .setTimestamp();

    await sendStaffLog(client,
        '🚨 דו"ח פעילות שוטף',
        'זוהו שינויים ברשימת המשתמשים הלא פעילים:',
        0xe67e22,
        embed.data.fields // העברת השדות מה-embed המקורי כ-fields ל-sendStaffLog
    );
  }
}

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
      await sendStaffLog(client,
          '❌ נכשל DM',
          `לא ניתן לשלוח DM ל- ${userId} (לא נמצא משתמש או לא ניתן לשלוח הודעה).`,
          0xFF0000
      );
      await updateMemberStatus(userId, {
        dmFailed: true,
        dmFailedAt: new Date().toISOString(),
        statusStage: 'failed_dm'
      });
      return false;
  }

  const fakeMessage = {
    content: '',
    author: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      bot: user.bot
    },
    member: memberReal || {
      displayName: user.username,
      permissions: { has: () => false },
      roles: { cache: new Collection() }
    },
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
    console.warn(`[SMARTCHAT] ❌ smartRespond נכשל עבור ${user.username}:`, err.message);
    await sendStaffLog(client,
        '❌ שגיאת SmartChat',
        `SmartChat נכשל עבור <@${user.id}>: \`\`\`${err.message}\`\`\``,
        0xFF0000
    );
    return false;
  }

  if (!dm || typeof dm !== 'string' || dm.length < 2) {
      await sendStaffLog(client,
          '⚠️ SmartChat תגובה ריקה',
          `SmartChat החזיר תגובה ריקה עבור <@${user.id}>. לא נשלח DM.`,
          0xFFA500
      );
      return false;
  }

  try {
    await user.send(dm);
    const updates = {
      dmSent: true,
      dmSentAt: new Date().toISOString(),
      reminderCount: isFinal ? (d.reminderCount || 0) + 1 : 1, // עדכון ספירה
      statusStage: isFinal ? 'final_warning' : 'dm_sent'
    };
    await updateMemberStatus(userId, updates);
    await sendStaffLog(client,
        '✉️ DM נשלח',
        `DM ${isFinal ? 'סופי' : 'רגיל'} נשלח בהצלחה ל- <@${user.id}>.`,
        0x00FF00,
        [{ name: 'תוכן הודעה', value: dm.substring(0, 1000) + (dm.length > 1000 ? '...' : '') }]
    );
    return true;
  } catch (err) {
    console.warn(`[DM] ❌ נכשל DM ל־${user.username}:`, err.message);
    await sendStaffLog(client,
        '❌ נכשל DM ישיר',
        `נכשל ניסיון שליחת DM ישיר ל- <@${user.id}>: \`\`\`${err.message}\`\`\``,
        0xFF0000
    );
    try {
      const fallbackButton = new ButtonBuilder()
        .setCustomId('dm_fallback_reply')
        .setLabel('💬 שלח תגובה לשמעון')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(fallbackButton);
      const dmChan = await user.createDM();
      await dmChan.send({
        content: '📬 לא הצלחנו לשלוח הודעה רשמית. תוכל להשיב כאן:',
        components: [row]
      });
      await sendStaffLog(client,
          '⚠️ DM Fallback נשלח',
          `Fallback DM נשלח בהצלחה ל- <@${user.id}>.`,
          0xFFA500
      );
    } catch (fallbackErr) {
      console.warn(`[DM] ⚠️ נכשל גם fallback ל־${user.username}:`, fallbackErr.message);
      await sendStaffLog(client,
          '❌ נכשל גם Fallback DM',
          `נכשל גם ניסיון שליחת Fallback DM ל- <@${user.id}>: \`\`\`${fallbackErr.message}\`\`\``,
          0xFF0000
      );
    }

    await updateMemberStatus(userId, {
      dmFailed: true,
      dmFailedAt: new Date().toISOString(),
      statusStage: 'failed_dm'
    });
    return false;
  }
}

async function handleMemberButtons(interaction, client) {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const members = await guild.members.fetch();
  const allTracked = await db.collection('memberTracking').get();
  const value = interaction.values?.[0];
  const action = interaction.customId === 'inactivity_action_select' ? value : interaction.customId;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // deferReply לכל פעולות הכפתורים/סלקט

  // 📩 שליחת DM רגיל
  if (action === 'send_dm_batch_list') {
    let count = 0;
    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
      const daysInactive = (now - last) / 86400000;

      // רק אם לא פעיל מספיק זמן, לא נשלח לו DM וגם לא נכשל DM
      if (daysInactive > INACTIVITY_DAYS && !d.dmSent && !d.dmFailed && d.statusStage !== 'final_warning') {
        const sent = await sendReminderDM(client, guild, members, userId, false);
        if (sent) count++;
      }
    }

    await sendStaffLog(client,
        '📤 שליחת תזכורות רגילות',
        `נשלחו תזכורות רגילות ל־${count} משתמשים בעקבות הפעלה ידנית.`,
        0x00aaff
    );
    return interaction.editReply({
      content: `📤 נשלחו תזכורות רגילות ל־${count} משתמשים.`,
      flags: MessageFlags.Ephemeral
    });
  }
  // 🔴 שליחת DM סופית
  if (action === 'send_dm_batch_final_check') {
    let count = 0;
    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
      const daysInactive = (now - last) / 86400000;

      // רק אם לא פעיל, נשלח לו כבר DM רגיל, לא הגיב ולא נכשל DM, ולא כבר בשלב סופי או יותר
      if (daysInactive > INACTIVITY_DAYS && d.dmSent && !d.replied && !d.dmFailed && d.statusStage !== 'final_warning') {
        const sent = await sendReminderDM(client, guild, members, userId, true);
        if (sent) count++;
      }
    }

    await sendStaffLog(client,
        '📨 שליחת תזכורות סופיות',
        `נשלחו תזכורות סופיות ל־${count} משתמשים בעקבות הפעלה ידנית.`,
        0xFF0000
    );
    return interaction.editReply({
      content: `📨 נשלחו תזכורות סופיות ל־${count} משתמשים.`,
      flags: MessageFlags.Ephemeral
    });
  }
  // 🛑 בעיטת משתמשים חסומים
  if (action === 'kick_failed_users') {
    let count = 0;
    let notInGuild = [];
    let failedKick = [];
    let kickedList = [];

    const eligibleToKick = allTracked.docs.filter(doc => {
      const d = doc.data();
      // אופטימיזציה: אם הוא מסומן כ-left, אין צורך לנסות לבעוט.
      return ['failed_dm', 'final_warning', 'final_warning_auto'].includes(d.statusStage || '') && d.statusStage !== 'left';
    });

    for (const doc of eligibleToKick) {
      const userId = doc.id;
      const member = members.get(userId);

      if (!member) {
        notInGuild.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).delete(); // נקי מדאטה בייס
        await sendStaffLog(client,
            '🧹 ניקוי משתמש (לא בשרת)',
            `המשתמש <@${userId}> לא נמצא בשרת ונמחק ממעקב הפעילות.`,
            0x808080
        );
        continue;
      }

      try {
        await member.kick('בעיטה לפי סטטוס – לא פעיל + חסום + לא הגיב');
        await db.collection('memberTracking').doc(userId).delete(); // נקי מדאטה בייס אחרי בעיטה
        kickedList.push(`<@${userId}>`);
        count++;
        await sendStaffLog(client,
            '👢 משתמש הורחק',
            `המשתמש <@${userId}> הורחק מהשרת בהצלחה.`,
            0xFF3300,
            [{ name: 'סיבה', value: 'לא פעיל + חסום + לא הגיב' }]
        );
      } catch (err) {
        failedKick.push(`<@${userId}>`);
        await sendStaffLog(client,
            '❌ כשל בהרחקה',
            `נכשל ניסיון הרחקת המשתמש <@${userId}>: \`\`\`${err.message}\`\`\``,
            0xFF0000
        );
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🛑 סיכום פעולת הרחקת משתמשים')
      .setDescription([
        `👢 הורחקו: **${count}**`,
        kickedList.length ? kickedList.join('\n') : '—',
        `🚫 לא בשרת (נמחקו מהמעקב): **${notInGuild.length}**`,
        notInGuild.length ? notInGuild.join('\n') : '—',
        `⚠️ נכשלו בהרחקה: **${failedKick.length}**`,
        failedKick.length ? failedKick.join('\n') : '—'
      ].join('\n'))
      .setColor(0xff3300)
      .setTimestamp();

    await sendStaffLog(client,
        '📊 סיכום הרחקה',
        'הושלמה פעולת הרחקת משתמשים לא פעילים וחסומים.',
        0xff3300,
        embed.data.fields
    );

    return interaction.editReply({ content: '✅ הפעולה בוצעה. סיכום נשלח לצוות.', flags: MessageFlags.Ephemeral });
  }
  // 💬 הצגת מי שענה ל־DM
  if (action === 'show_replied_list') {
    const replied = allTracked.docs.filter(doc => doc.data().replied);
    if (!replied.length) {
      return interaction.editReply({ content: 'אף אחד לא ענה ל־DM עדיין.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('משתמשים שהגיבו להודעה פרטית 💬')
      .setDescription(replied.map(doc => `<@${doc.id}>`).join(', '))
      .setColor(0x00cc99);

    return interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
  // ❌ הצגת משתמשים שנכשל DM אליהם
  if (action === 'show_failed_list') {
    const failedUsers = allTracked.docs.filter(doc => doc.data().dmFailed);
    if (!failedUsers.length) {
      return interaction.editReply({ content: 'אין משתמשים שנכשל DM אליהם.', flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle('❌ משתמשים שנכשל DM אליהם')
      .setDescription(failedUsers.map(doc => `<@${doc.id}>`).join(', '))
      .setColor(0xff0000);

    return interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
   // 📊 סטטוס נוכחי של משתמשים
  if (action === 'show_status_summary') {
    const summary = {};
    for (const doc of allTracked.docs) {
      const status = doc.data().statusStage || 'unknown';
      summary[status] = (summary[status] || 0) + 1;
    }

    const statusMap = { // מפה לתרגום סטטוסים לשם קריא יותר
        joined: '🆕 הצטרף',
        waiting_activity: '⌛ מחכה לפעולה',
        active: '✅ פעיל',
        dm_sent: '📩 תזכורת נשלחה',
        final_warning: '🔴 תזכורת סופית',
        final_warning_auto: '🚨 אזהרה סופית (אוטומטי)', // סטטוס חדש
        responded: '💬 ענה ל-DM', // שינוי שם
        kicked: '🚫 נבעט',
        failed_dm: '❌ נכשל DM',
        left: '🚪 עזב את השרת', // שינוי שם
        unknown: '❓ לא ידוע'
    };

    const fields = Object.entries(summary).map(([key, val]) => ({
      name: statusMap[key] || key,
      value: `**${val}** משתמשים`,
      inline: true
    }));

    const embed = new EmbedBuilder()
      .setTitle('📊 סטטוס נוכחי של משתמשים')
      .addFields(fields)
      .setColor(0x3498db)
      .setFooter({ text: 'Shimon BOT – לפי statusStage' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
  // 📊 משתמשים לא פעילים X ימים
  if (action.startsWith('inactive_')) {
    const days = parseInt(action.split('_')[1]);
    const now = Date.now();

    const matches = [];

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
      const inactiveDays = (now - last) / 86400000;

      const member = members.get(userId);
      const isBot = member?.user?.bot || userId === client.user.id;

      // יש לכלול משתמשים עם סטטוסים שעדיין "בטיפול" ולא סיימו את התהליך (לא kicked, left, responded, active)
      if (inactiveDays >= days && !['left', 'kicked', 'responded', 'active'].includes(d.statusStage) && !isBot) {
        matches.push(doc);
      }
    }

    if (!matches.length) {
      return interaction.editReply({ content: `אין משתמשים עם חוסר פעילות של ${days}+ ימים תחת ניטור.`, flags: MessageFlags.Ephemeral });
    }

    const embed = new EmbedBuilder()
      .setTitle(`${days}+ ימים ללא פעילות`)
      .setDescription(matches.map(doc => `• <@${doc.id}> (סטטוס: ${doc.data().statusStage || 'לא ידוע'})`).join('\n').slice(0, 4000))
      .setColor(0xe67e22)
      .setFooter({ text: `Shimon BOT – ניטור פעילות • ${matches.length} משתמשים` });

    return interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  // Fallback לכל פעולה לא ידועה
  await sendStaffLog(client,
      '⚠️ פעולת אינטראקציה לא ידועה',
      `פעולת אינטראקציה לא מטופלת: \`${action}\`.`,
      0xFFA500
  );
  return interaction.editReply({ content: 'פעולה לא ידועה או לא נתמכת.', flags: MessageFlags.Ephemeral });
}

module.exports = {
  handleMemberButtons,
  startAutoTracking, // 💡 הוסף את השורה הזו
  sendInactiveReminders, // 💡 וגם את זו, נצטרך אותה ידנית
  kickFailedUsers // 💡 וגם את זו
};