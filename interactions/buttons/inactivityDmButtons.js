// 📁 interactions/buttons/inactivityDmButtons.js
const { ButtonBuilder, ActionRowBuilder, ButtonStyle, Collection, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/firebase');
const smartChat = require('../../handlers/smartChat');
const { sendStaffLog } = require('../../utils/staffLogger');

// פונקציית עזר לעדכון סטטוס משתמש ב-Firebase
async function updateMemberStatus(userId, updates) {
  try {
    await db.collection('memberTracking').doc(userId).set(updates, { merge: true });
    return true;
  } catch (error) {
    console.error(`[DB] ❌ Failed to update status for ${userId}: ${error.message}`);
    return false;
  }
}

/**
 * פונקציה לשליחת הודעת DM תזכורת למשתמש לא פעיל.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 * @param {import('discord.js').Guild} guild - אובייקט השרת.
 * @param {import('discord.js').Collection<string, import('discord.js').GuildMember>} members - קולקציית חברי השרת.
 * @param {string} userId - ה-ID של המשתמש לשליחת DM.
 * @param {boolean} isFinal - האם זוהי תזכורת סופית (קשוחה) או רגילה (חברית).
 * @returns {Promise<{success: boolean, reason?: string}>} - אובייקט המציין הצלחה או כישלון וסיבה.
 */
async function sendReminderDM(client, guild, members, userId, isFinal = false) {
  const docRef = db.collection('memberTracking').doc(userId);
  const doc = await docRef.get();
  const d = doc.exists ? doc.data() : {};
  const now = Date.now();
  const last = new Date(d.lastActivity || d.joinedAt || 0).getTime();
  const daysInactive = Math.floor((now - last) / 86400000);

  const memberReal = members.get(userId) || await guild.members.fetch(userId).catch(() => null);
  const user = memberReal?.user || await client.users.fetch(userId).catch(() => null);

  if (!user || typeof user.send !== 'function' || user.bot) {
      await updateMemberStatus(userId, { dmFailed: true, dmFailedAt: new Date().toISOString(), statusStage: 'failed_dm' });
      return { success: false, reason: 'No user object, cannot send DMs, or is a bot' };
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

  let dmContent;
  try {
    dmContent = await smartChat.smartRespond(fakeMessage, isFinal ? 'קשוח' : 'רגיש');
  } catch (err) {
    return { success: false, reason: `SmartChat Error: ${err.message}`};
  }

  if (!dmContent || typeof dmContent !== 'string' || dmContent.length < 2) {
      return { success: false, reason: 'SmartChat returned empty response'};
  }

  try {
    await user.send(dmContent);
    const updates = { dmSent: true, dmSentAt: new Date().toISOString(), reminderCount: (d.reminderCount || 0) + 1, statusStage: isFinal ? 'final_warning' : 'dm_sent' };
    await updateMemberStatus(userId, updates);
    return { success: true };
  } catch (err) {
    // Fallback: נסה לשלוח כפתור אם DM נכשל לחלוטין
    try {
      const fallbackButton = new ButtonBuilder().setCustomId('dm_fallback_reply').setLabel('💬 שלח תגובה לשמעון').setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(fallbackButton);
      const dmChan = await user.createDM();
      await dmChan.send({ content: '📬 לא הצלחנו לשלוח הודעה רשמית. תוכל להשיב כאן:', components: [row] });
    } catch (fallbackErr) {
        console.error(`[DM] ❌ Fallback DM for ${userId} failed too: ${fallbackErr.message}`);
    }
    await updateMemberStatus(userId, { dmFailed: true, dmFailedAt: new Date().toISOString(), statusStage: 'failed_dm' });
    return { success: false, reason: `Direct DM Failed: ${err.message}`};
  }
}

/**
 * פונקציית handler לכפתורי שליחת תזכורות DM.
 * ✅ פונקציות customId ו-execute של האינטראקציה
 * @param {import('discord.js').ButtonInteraction} interaction - אובייקט האינטראקציה.
 * @param {import('discord.js').Client} client - אובייקט הקליינט של הבוט.
 */
const execute = async (interaction, client) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const isFinal = interaction.customId === 'send_dm_batch_final_check';
  const guild = interaction.guild;
  const members = await guild.members.fetch();

  const allTracked = await db.collection('memberTracking').get();
  const success = [];
  const fails = [];

  for (const doc of allTracked.docs) {
    const d = doc.data();
    const userId = doc.id;
    const status = d.statusStage || 'joined';
    let shouldSend = false;

    if (!isFinal && status === 'waiting_dm') {
      shouldSend = true;
    } else if (isFinal && status === 'final_warning') {
      shouldSend = true;
    }

    if (shouldSend) {
      const result = await sendReminderDM(client, guild, members, userId, isFinal);
      if (result.success) {
        success.push(`<@${userId}>`);
      } else {
        fails.push(`<@${userId}> (${result.reason})`);
      }
    }
  }

  const summaryEmbed = new EmbedBuilder()
    .setTitle(`📤 סיכום שליחת תזכורות ${isFinal ? 'סופיות' : 'רגילות'}`)
    .setDescription('הושלם סבב שליחת תזכורות ידני.')
    .setColor(isFinal ? 0xFF6347 : 0x00aaff)
    .setTimestamp();

  if (success.length > 0) {
    summaryEmbed.addFields({
      name: '✅ נשלחו בהצלחה',
      value: success.length > 10 ? `${success.slice(0, 10).join('\n')}\n ועוד ${success.length - 10}...` : success.join('\n'),
      inline: false
    });
  } else {
    summaryEmbed.addFields({ name: '✅ נשלחו בהצלחה', value: '—', inline: false });
  }

  if (fails.length > 0) {
    summaryEmbed.addFields({
      name: '❌ נכשלו',
      value: fails.length > 10 ? `${fails.slice(0, 10).join('\n')}\n ועוד ${fails.length - 10}...` : fails.join('\n'),
      inline: false
    });
  } else {
    summaryEmbed.addFields({ name: '❌ נכשלו', value: '—', inline: false });
  }

  await sendStaffLog(client, `📤 סיכום שליחת תזכורות`, `בוצע סבב שליחת תזכורות DM.`, isFinal ? 0xFF6347 : 0x00aaff, summaryEmbed.fields);

  return interaction.editReply({ content: '✅ סבב התזכורות בוצע. סיכום נשלח לערוץ הצוות.', flags: MessageFlags.Ephemeral });
};

const customId = (interaction) => {
  return interaction.customId === 'send_dm_batch_list' ||
         interaction.customId === 'send_dm_batch_final_check';
};

module.exports = {
  customId,
  execute,
  sendReminderDM // ייצוא הפונקציה לשימוש ע"י Cron jobs
};