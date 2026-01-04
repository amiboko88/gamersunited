// 📁 handlers/verificationButton.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/firebase');
const { getUserRef } = require('../utils/userUtils'); // ✅ עבודה מול ה-DB המאוחד
const { sendStaffLog } = require('../utils/staffLogger');
const path = require('path');

// הגדרות קבועות
const VERIFIED_ROLE_ID = '1120787309432938607';
const VERIFICATION_CHANNEL_ID = '1120791404583587971';
const STAFF_CHANNEL_ID = '881445829100060723';
const METADATA_DOC_REF = db.collection('system_metadata').doc('verification_message');

const embedImageUrl = 'attachment://verify.png';

/**
 * מציב את הודעת האימות הראשית בערוץ
 */
async function setupVerificationMessage(client) {
  const guild = client.guilds.cache.first();
  const channel = guild.channels.cache.get(VERIFICATION_CHANNEL_ID);
  if (!channel?.isTextBased()) return;

  // בדיקה אם ההודעה קיימת כדי לא לשלוח סתם
  const metaDoc = await METADATA_DOC_REF.get();
  const existingId = metaDoc.exists ? metaDoc.data().messageId : null;

  if (existingId) {
    try {
      await channel.messages.fetch(existingId);
      return; 
    } catch (e) {
      console.log('🔄 הודעת אימות ישנה נמחקה, יוצר חדשה...');
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('ברוכים הבאים ל-Gamers United! 🇮🇱')
    .setDescription(
      `אהלן! הגעתם לקהילת הגיימינג הכי חזקה בארץ.\n\n` +
      `כדי לקבל גישה לחדרים, לראות מי מחובר ולהצטרף למשחקים, עליכם לאשר את החוקים.\n\n` +
      `**מה עושים?**\n` +
      `1️⃣ לוחצים על הכפתור למטה ("בצע אימות").\n` +
      `2️⃣ הבוט ישלח לכם הודעה בפרטי לבדיקה קצרה.\n` +
      `3️⃣ סיימתם? אתם בפנים!`
    )
    .setColor('#00FF00')
    .setImage(embedImageUrl)
    .setFooter({ text: 'תהליך אוטומטי • Gamers United Bot' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('start_verification_process')
      .setLabel('✅ בצע אימות')
      .setStyle(ButtonStyle.Success)
  );

  const sentMsg = await channel.send({
    embeds: [embed],
    components: [row],
    files: [{ attachment: path.join(__dirname, '../assets/verify.png'), name: 'verify.png' }]
  });

  await METADATA_DOC_REF.set({ messageId: sentMsg.id });
}

/**
 * מטפל בלחיצה על כפתור האימות
 */
async function handleVerificationButton(interaction) {
  if (interaction.customId !== 'start_verification_process') return;

  const member = interaction.member;
  
  // הגנה: אם כבר יש רול
  if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
    return interaction.reply({ content: 'אתה כבר מאומת יא בוט! 🤖', flags: MessageFlags.Ephemeral });
  }

  try {
    // 1. נותנים רול מיד (חווית משתמש מהירה)
    await member.roles.add(VERIFIED_ROLE_ID);
    
    // 2. עדכון ב-DB המאוחד
    const userRef = await getUserRef(member.id, 'discord');
    await userRef.set({
        tracking: {
            verificationStatus: 'verified',
            verifiedAt: new Date().toISOString(),
            method: 'button_click'
        },
        meta: {
            firstSeen: new Date().toISOString(),
            lastActive: new Date().toISOString()
        }
    }, { merge: true });

    // 3. שליחת הודעה פרטית (DM)
    let dmSent = false;
    try {
        await member.send(
            `היי **${member.displayName}**! ברוך הבא ל-Gamers United 🎉\n` +
            `קיבלת גישה לשרת. אתה מוזמן לקפוץ לחדרי הדיבור או להציג את עצמך בצ'אט הכללי.\n` +
            `אם אתה צריך משהו, אני פה.`
        );
        dmSent = true;
    } catch (e) {
        // DM חסום
    }

    await interaction.reply({ content: '✅ האימות הושלם! ברוך הבא למשפחה.', flags: MessageFlags.Ephemeral });

    // 4. לוג לצוות
    await sendStaffLog(
        '🟢 משתמש חדש אומת', 
        `המשתמש <@${member.id}> ביצע אימות עצמי.\nDM נשלח: ${dmSent ? '✅' : '❌ (חסום)'}`, 
        0x00FF00
    );

  } catch (error) {
    console.error('Verification Error:', error);
    await interaction.reply({ content: '❌ אירעה שגיאה בתהליך. נסה שוב או פנה למנהל.', flags: MessageFlags.Ephemeral });
  }
}

/**
 * 🧠 טיפול בתשובות DM (הלוגיקה שהייתה חסרה!)
 * פונקציה זו נקראת מתוך ה-Core Logic כשמתקבלת הודעה בפרטי
 */
async function handleVerificationDmResponse(message, userData) {
    const content = message.content.toLowerCase();
    const userId = message.author.id;

    // בדיקה אם המשתמש כבר מאומת - אם כן, אנחנו עונים לו בצורה "חברית" ולא של בוט אימות
    if (userData?.tracking?.verificationStatus === 'verified') {
        
        let replyText = 'אני פה אם תצטרך עוד משהו 💬';
        
        // ניתוח סנטימנט פרימיטיבי (כמו בקוד הישן שלך)
        const isNegative = ['לא', 'דיי', 'די', 'חלאס', 'תעזוב', 'שתוק'].some(w => content.includes(w));
        const isQuestion = ['מה', 'איך', 'למה', 'מתי', '?'].some(w => content.includes(w));
        const isPositive = ['תודה', 'אחלה', 'סבבה', 'טוב', 'כן'].some(w => content.includes(w));

        if (isNegative) {
            replyText = 'אין בעיה. רק שתדע — אם לא תהיה פעיל בהמשך, המערכת תסמן אותך. 🙃';
        } else if (isQuestion) {
            replyText = 'פשוט תכתוב משהו בצ׳אט הכללי או תקפוץ לשיחה בקול. זה כל מה שצריך 🎧';
        } else if (isPositive) {
            replyText = 'תודה! תמיד כיף לראות חיוך מהצד השני של המסך ✌️';
        }

        try {
            await message.channel.send(replyText);
            
            // עדכון לוג שהמשתמש הגיב
            const userRef = await getUserRef(userId, 'discord');
            await userRef.update({
                'history.dmResponses': require('firebase-admin').firestore.FieldValue.arrayUnion({
                    content: message.content,
                    replySent: replyText,
                    timestamp: new Date().toISOString()
                })
            });

        } catch (err) {
            console.warn(`⚠️ לא ניתן להשיב ל־${userId}:`, err.message);
        }
        return true; // טופל
    }
    
    return false; // לא קשור לאימות
}

/**
 * ⏰ Cron Job: בדיקת הודעות שלא נענו (החלק השני שהיה חסר)
 * בודק משתמשים שקיבלו DM ולא הגיבו, או שצריך לשלוח להם תזכורת.
 */
async function checkPendingDms(client) {
    console.log('[Verification] 🔍 בודק אימותים תלויים...');
    
    const guild = client.guilds.cache.first();
    if (!guild) return;

    // כאן בעתיד תוכל להוסיף לוגיקה שבודקת מי קיבל רול אבל לא היה פעיל
    // כרגע המנגנון החדש ב-inactivityCronJobs עושה את זה טוב יותר,
    // אבל השארתי את הפונקציה כדי לשמור על המבנה המקורי למקרה שתצטרך לוגיקה ייעודית לאימות.
}

module.exports = { 
    setupVerificationMessage, 
    handleVerificationButton, 
    handleVerificationDmResponse, 
    checkPendingDms 
};