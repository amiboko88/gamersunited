// 📁 handlers/antispam.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const { smartRespond } = require('./smartChat'); 

const STAFF_CHANNEL_ID = '881445829100060723';
const TRACKING_COLLECTION = 'dmTracking';
const INFRACTIONS_COLLECTION = 'infractions';
const WARNING_TTL_MS = 1000 * 60 * 60 * 24; // 24 שעות

const { sendStaffLog } = require('../utils/staffLogger');

// רשימות הקללות הקיימות בתוך הקובץ הזה
const badWordsHe = [
  'תזדיין', 'תמות', 'זדיין', 'מפגר', 'מטומטם', 'בן זונה', 'בן אלף זונות',
  'אמא שלך', 'אבא שלך', 'זין', 'זיונר', 'מזדיין', 'מתרומם', 'מתומתם',
  'יא חתיכת', 'חלאה', 'כלב', 'כלבה', 'כלבתא', 'מניאק', 'קוקסינל',
  'הומו', 'לסבית', 'זונה', 'זונות', 'שרמוטה', 'שרמוטות', 'יא אפס',
  'יא עלוב', 'אידיוט', 'אפס'
];

const badWordsEn = [
  'fuck', 'fucker', 'fucking', 'motherfucker', 'bitch', 'whore', 'slut', 'cunt',
  'asshole', 'dick', 'pussy', 'retard', 'idiot'
];

const badWords = [...badWordsHe, ...badWordsEn];
const linkRegex = /(https?:\/\/[^\s]+)/g;

function checkViolation(content) {
  const lowerContent = content.toLowerCase();
  
  if (linkRegex.test(lowerContent)) {
    return { type: 'link', word: content.match(linkRegex)[0] };
  }

  for (const word of badWords) {
    if (lowerContent.includes(word)) {
      return { type: 'bad_word', word: word };
    }
  }

  return null;
}

async function sendWarningDM(message, violation) {
    try {
        const dmChannel = await message.author.createDM();
        const msg = await dmChannel.send(`הודעתך בשרת נמחקה עקב שימוש בביטוי/קישור לא הולם: \`${violation.word}\`.\nזוהי אזהרה ראשונה. אנא קרא שוב את חוקי השרת. להסבר נוסף, השב להודעה זו.`);
        
        await db.collection(TRACKING_COLLECTION).doc(message.author.id).set({
            warningSentAt: new Date(),
            guildId: message.guild.id
        });
        
        return true;
    } catch (error) {
        if (error.code === 50007) { // Cannot send messages to this user
            sendStaffLog(message.client, '⚠️ DM חסום', `המשתמש <@${message.author.id}> חוסם הודעות פרטיות. לא ניתן היה לשלוח לו אזהרה.`);
        } else {
            console.error(`שגיאה בשליחת DM למשתמש ${message.author.id}:`, error);
        }
        return false;
    }
}

async function handleSpam(message) {
    if (!message.guild || message.author.bot) return;

    // בודק אם למשתמש יש הרשאות ניהול
    if (message.member && (message.member.permissions.has('Administrator') || message.member.permissions.has('ManageMessages'))) {
        return;
    }

    const violation = checkViolation(message.content);
    if (!violation) return;
    
    try {
        await message.delete();
        const dmSent = await sendWarningDM(message, violation);
        
        // --- ✅ [תיקון] הוספת הפרמטר החסר "message.content" ---
        await logViolationToStaff(message.author.id, message.member.displayName, violation.type, message.content, message.guild);
        // --------------------------------------------------------

        if (dmSent) {
            await message.channel.send({ 
                content: `<@${message.author.id}>, הודעתך נמחקה ונשלחה אליך אזהרה בפרטי.`,
                flags: [MessageFlags.SuppressEmbeds] 
            }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 5000));
        }

    } catch (error) {
        console.error(`שגיאה בטיפול בספאם מהמשתמש ${message.author.id}:`, error);
    }
}

async function logReplyToStaff(userId, content, guild) {
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
        .setTitle('🚨 זוהתה הפרת חוקים')
        .addFields(
            { name: 'משתמש', value: `<@${userId}> (${displayName})` },
            { name: 'סוג ההפרה', value: type === 'link' ? 'שליחת קישור' : 'שימוש במילה לא הולמת' },
            { name: 'הודעה מקורית', value: `\`\`\`${original}\`\`\`` }
        )
        .setTimestamp();

    staffChannel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { 
    handleSpam,
    logReplyToStaff,
    logNoReplyToStaff
};