// 📁 handlers/antispam.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const { smartRespond } = require('./smartChat'); 

const STAFF_CHANNEL_ID = '881445829100060723';
const TRACKING_COLLECTION = 'dmTracking';
const INFRACTIONS_COLLECTION = 'infractions';
const WARNING_TTL_MS = 1000 * 60 * 60 * 24; // 24 שעות

const { sendStaffLog } = require('../utils/staffLogger'); // ✅ ייבוא sendStaffLog ישירות, ללא שם חדש

// ✅ רשימות הקללות הקיימות בתוך הקובץ הזה
const badWordsHe = [
  'תזדיין', 'תמות', 'זדיין', 'מפגר', 'מטומטם', 'בן זונה', 'בן אלף זונות',
  'אמא שלך', 'אבא שלך', 'זין', 'זיונר', 'מזדיין', 'מתרומם', 'מתומתם',
  'יא חתיכת', 'חלאה', 'כלב', 'כלבה', 'כלבתא', 'מניאק', 'קוקסינל',
  'הומו', 'לסבית', 'זונה', 'זונות', 'שרמוטה', 'שרמוטות', 'יא אפס',
  'יא עלוב', 'אידיוט', 'אפס', 'פסיכי', 'טמבל', 'מפגר', 'מסריח', 'מגעיל',
  'דביל', 'חרא', 'נבלה', 'נודניק', 'בהמה', 'בהמתי', 'עקום', 'עלוב',
  'שטן', 'נאצי', 'נאצית', 'נאציים', 'כושילאמאשך', 'חרא של בן אדם',
  'זבל', 'זבל אנושי', 'סמרטוט', 'פח אשפה', 'קללה', 'לוזר', 'נפול',
  'מטונף', 'שייגעץ', 'שמנה', 'גועל', 'דוחה', 'מעפן', 'מכוער',
  'קקה', 'חסרת כבוד', 'חסר כבוד', 'קללה קשה', 'קללות', 'סתום', 'שתוק'
];

const badWordsEn = [
  'fuck', 'shit', 'bitch', 'asshole', 'faggot', 'cunt',
  'bastard', 'dick', 'slut', 'whore', 'jerk', 'crap', 'damn',
  'moron', 'retard', 'nigger', 'gay', 'stupid', 'idiot', 'dumb',
  'pussy', 'loser', 'freak', 'trash', 'ugly', 'fat', 'kill',
  'motherfucker', 'cock', 'suck', 'hell', 'dammit', 'twat', 'nigga',
  'pedophile', 'rapist', 'incest', 'nazi', 'racist', 'dyke',
  'abuse', 'sicko', 'creep', 'jerkoff', 'douche', 'lame', 'scum',
  'shithead', 'fool', 'wanker'
];

// ✅ רשימת הקללות המאוחדת שתשמש לבדיקה
const allCursesCombined = badWordsHe.concat(badWordsEn);

const invitePatterns = ['discord.gg', 'discord.com/invite', 'https://discord.gg'];

function checkMessageType(content) {
  const lowered = content.toLowerCase();
  if (invitePatterns.some(p => lowered.includes(p))) return 'invite';
  if (allCursesCombined.some(word => lowered.includes(word))) return 'curse'; 
  return null;
}

async function handleSpam(message) {
  if (message.author.bot || !message.guild) return;

  const content = message.content;
  const type = checkMessageType(content);
  if (!type) return;

  const userId = message.author.id;
  const displayName = message.member?.displayName || message.author.username;

  // אם מדובר בקללה על שמעון
  const isTowardBot = /שמעון|shim|bot/i.test(content);
  if (type === 'curse' && isTowardBot) {
    return smartRespond(message, 'כועס');
  }

  // המשך אנטי-ספאם רגיל
  try {
    await message.delete();
  } catch (err) {
    console.warn(`⚠️ לא ניתן למחוק את ההודעה: ${err.message}`);
    return;
  }

  let publicResponse = '🚫 ההודעה שלך נחסמה – לא יפה לדבר ככה.';
  if (type === 'invite') publicResponse = '🚫 פרסום הזמנות אסור כאן.';

  try {
    const reply = await message.channel.send({ content: `<@${userId}> ${publicResponse}` });
    setTimeout(() => reply.delete().catch(() => {}), 15_000);
  } catch (err) {
    console.warn(`⚠️ שגיאה בשליחת תגובה בערוץ: ${err.message}`);
  }

  let responded = false;
  let dmText = 'נא לא לקלל. אם יש בעיה – דבר איתי כאן.';
  if (type === 'invite') dmText = 'פרסום הזמנות אסור כאן. שמור את זה לפרטי אם צריך.';

  try {
    const dm = await message.author.send(dmText);

    await db.collection(TRACKING_COLLECTION).doc(userId).set({
      sentAt: new Date().toISOString(),
      type,
      status: 'pending',
      guildId: message.guild.id,
      channelId: message.channel.id,
      originalMessage: content
    });

    const collector = dm.channel.createMessageCollector({ filter: m => !m.author.bot, time: WARNING_TTL_MS, max: 1 });

    collector.on('collect', async reply => {
      responded = true;
      await db.collection(TRACKING_COLLECTION).doc(userId).update({ status: 'responded', response: reply.content });
      // ✅ קריאה ל-sendStaffLog (הפעם הנכונה)
      await sendStaffLog(client, '📬 תגובה לאזהרת DM', `<@${userId}> הגיב ל־DM: \`${reply.content}\``, 0xFFA500); 
    });

    collector.on('end', async () => {
      if (!responded) {
        await db.collection(TRACKING_COLLECTION).doc(userId).update({ status: 'ignored' });
        // ✅ קריאה ל-sendStaffLog (הפעם הנכונה)
        await sendStaffLog(client, '⏱️ לא התקבלה תגובה ל־DM', `<@${userId}> לא הגיב תוך 24 שעות להודעת הבוט.`, 0xFFA500);
      }
    });
  } catch (err) { // לתפוס שגיאות שליחת DM
    console.log(`📭 לא ניתן לשלוח DM ל־${displayName}: ${err.message}`);
    // עדיין נרצה לתעד זאת ב-STAFF LOG אם נכשל
    await sendStaffLog(client, '❌ כשלון שליחת DM', `נכשל שליחת DM ל־<@${userId}> (${displayName}): ${err.message}`, 0xFF0000);
  }

  try {
    const ref = db.collection(INFRACTIONS_COLLECTION).doc(userId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : { count: 0 };

    await ref.set({
      count: (data.count || 0) + 1,
      lastReason: type,
      lastTimestamp: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error('❌ שגיאה בשמירת אזהרה:', err.message);
  }

  // ✅ קריאה ל-sendStaffLog (הפעם הנכונה)
  await sendStaffLog(client, '🚨 זוהתה הפרת שפה', 
      `**משתמש:** <@${userId}> (${displayName})\n**סוג הפרה:** \`${type}\`\n**הודעה מקורית:** \`${original || '—'}\``, 0xFF0000);
}

// ✅ פונקציות העזר הועברו למעלה, אין צורך בהן ב-module.exports
/*
async function logDmReplyToStaff(userId, content, guild) {
  const staffChannel = guild.channels.cache.get(STAFF_CHANNEL_ID);
  if (!staffChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor('Orange')
    .setTitle('📬 תגובה לאזהרת DM')
    .addFields({ name: 'משתמש', value: `<@${userId}> (${userId})` }, { name: 'תגובה', value: content })
    .setTimestamp();

  staffChannel.send({ embeds: [embed] }).catch(() => {});
}

async function logNoReplyToStaff(userId, guild) {
  const staffChannel = guild.channels.cache.get(STAFF_CHANNEL_ID);
  if (!staffChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor('Yellow')
    .setTitle('⏱️ לא התקבלה תגובה ל־DM')
    .setDescription(`<@${userId}> לא הגיב תוך 24 שעות להודעת הבוט.`)
    .setTimestamp();

  staffChannel.send({ embeds: [embed] }).catch(() => {});
}

async function logViolationToStaff(userId, displayName, type, original, guild) {
  const staffChannel = guild.channels.cache.get(STAFF_CHANNEL_ID);
  if (!staffChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor('Red')
    .setTitle('🚨 זוהתה הפרת שפה')
    .addFields(
      { name: 'משתמש', value: `<@${userId}> (${userId})` },
      { name: 'סוג הפרה', value: type },
      { name: 'הודעה מקורית', value: original || '—' }
    )
    .setTimestamp();

  staffChannel.send({ embeds: [embed] }).catch(() => {});
}
*/

module.exports = {
    handleSpam,
    // ✅ allCurseWords מוסר מהייצוא, כי משמש רק פנימית
};