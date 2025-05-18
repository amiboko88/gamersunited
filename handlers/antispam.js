// 📁 handlers/antiSpam.js
const { EmbedBuilder, Events } = require('discord.js');
const db = require('../utils/firebase');

const STAFF_CHANNEL_ID = '881445829100060723';
const TRACKING_COLLECTION = 'dmTracking';
const INFRACTIONS_COLLECTION = 'infractions';
const WARNING_TTL_MS = 1000 * 60 * 60 * 24; // 24 שעות

const badWordsHe = [
  'בן זונה', 'יא חתיכת', 'זין', 'שטן', 'קוסאמק', 'שייגעץ',
  'מניאק', 'חרא', 'דביל', 'מפגר', 'טמבל', 'אידיוט', 'מטומטם',
  'עצלן', 'שרמוטה', 'שמנה', 'כלבה', 'זונה', 'נבלה', 'בהמה',
  'מכוער', 'נודניק', 'מסריח', 'עלוב', 'נפול', 'כושילאמאשך',
  'קוקסינל', 'הומו', 'לסבית', 'זבל', 'מת', 'עקום', 'קללה',
  'יא אפס', 'יא עלוב', 'אמא שלך', 'אבא שלך', 'בושה',
  'מגעיל', 'מטונף', 'אנטי', 'חלאה', 'נאצי', 'זבל אנושי',
  'סמרטוט', 'קרציה', 'פח אשפה', 'כישלון'
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
const invitePatterns = ['discord.gg', 'discord.com/invite', 'https://discord.gg'];

function checkMessageType(content) {
  const lowered = content.toLowerCase();

  if (invitePatterns.some(p => lowered.includes(p))) return 'invite';
  if (badWordsHe.concat(badWordsEn).some(word => lowered.includes(word))) return 'curse';
  return null;
}

async function handleSpam(message) {
  if (message.author.bot || !message.guild) return;

  const type = checkMessageType(message.content);
  if (!type) return;

  const userId = message.author.id;
  const displayName = message.member?.displayName || message.author.username;

  let newContent = '🚫 ההודעה נערכה – לא יפה לדבר ככה.';
  if (type === 'invite') newContent = '🚫 פרסום הזמנות אסור כאן.';

  try {
    await message.edit(newContent);
  } catch (err) {
    console.warn(`⚠️ לא ניתן לערוך את ההודעה: ${err.message}`);
    return;
  }

  let dmText = 'נא לא לקלל. אם יש בעיה – דבר איתי כאן.';
  if (type === 'invite') dmText = 'פרסום הזמנות אסור כאן. שמור את זה לפרטי אם צריך.';

  try {
    const dm = await message.author.send(dmText);

    // 🧠 רשום למסד למעקב ארוך טווח
    await db.collection(TRACKING_COLLECTION).doc(userId).set({
      sentAt: new Date().toISOString(),
      type,
      guildId: message.guild.id,
      channelId: message.channel.id,
      originalMessage: message.content
    });

    // ⏳ מאזין לתגובה (גם אם לא סומכים על זה ב־Restart – נרשום בכל מקרה)
    const collector = dm.channel.createMessageCollector({
      filter: m => !m.author.bot,
      time: WARNING_TTL_MS,
      max: 1
    });

    collector.on('collect', async reply => {
      await logDmReplyToStaff(userId, reply.content, message.guild);
    });

  } catch {
    console.log(`📭 לא ניתן לשלוח DM ל־${displayName}`);
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

  await logViolationToStaff(userId, displayName, type, message.content, message.guild);
}

// 🔔 תגובה ל-DM שנשלח קודם
async function logDmReplyToStaff(userId, content, guild) {
  const staffChannel = guild.channels.cache.get(STAFF_CHANNEL_ID);
  if (!staffChannel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor('Orange')
    .setTitle('📬 תגובה לאזהרת DM')
    .addFields(
      { name: 'משתמש', value: `<@${userId}> (${userId})` },
      { name: 'תגובה', value: content }
    )
    .setTimestamp();

  staffChannel.send({ embeds: [embed] }).catch(() => {});
}

// 📄 לוג כללי על ההפרה
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

module.exports = { handleSpam };
