// 📁 handlers/verificationButton.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const { logToWebhook } = require('../utils/logger');
const path = require('path');

const VERIFIED_ROLE_ID = '1120787309432938607';
const VERIFICATION_CHANNEL_ID = '1120791404583587971';
const STAFF_CHANNEL_ID = '881445829100060723';
const TRACKING_COLLECTION = 'dmTracking';
const MESSAGE_COLLECTION = 'verificationMessages';
const embedImageUrl = 'attachment://verify.png';

const ALLOWED_EXTRA_ROLES = [
  '1372319014398726225', // 🎮 Warzone
  '1372319255025946775'  // 🎮 Other Games
];

// --- נשאר ללא שינוי ---
async function setupVerificationMessage(client) {
  const guild = client.guilds.cache.first();
  const channel = guild.channels.cache.get(VERIFICATION_CHANNEL_ID);
  if (!channel?.isTextBased()) return;

  const messageRef = db.collection(MESSAGE_COLLECTION).doc(guild.id);
  const existing = await messageRef.get();
  if (existing.exists) return;

  const embed = new EmbedBuilder()
    .setTitle('ברוך הבא ל־Gamers United IL 🎮')
    .setDescription(
      '**אם אתה משתמש XBOX / PlayStation ואינך רואה כפתור:**\n' +
      'פשוט כתוב כאן “אמת אותי” או שלח הודעה ל־שמעון בפרטי.\n\n' +
      'ברוב הקונסולות אין תמיכה בכפתורי Discord – זה בסדר. אנחנו כאן לעזור!'
    )
    .setImage(embedImageUrl)
    .setColor('#ffa500');

  const button = new ButtonBuilder()
    .setCustomId('verify')
    .setLabel('✅ לחץ כאן לאימות')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(button);

  const sent = await channel.send({
    embeds: [embed],
    components: [row],
    files: [path.join(__dirname, '../assets/verify.png')]
  });

  await messageRef.set({ messageId: sent.id });
}

// --- נשאר ללא שינוי ---
async function handleInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'verify') return;

  const member = interaction.member;
  const user = interaction.user;
  const roles = member.roles.cache;
  const staffChannel = interaction.guild.channels.cache.get(STAFF_CHANNEL_ID);

  const filteredRoles = roles.filter(
    r => r.id !== interaction.guild.roles.everyone.id && !ALLOWED_EXTRA_ROLES.includes(r.id)
  );

  const allowed = filteredRoles.size === 0;

  if (!allowed) {
    return interaction.reply({
      content: '🛑 נראה שכבר יש לך תפקידים בשרת. אם אתה קונסוליסט — תכתוב כאן "אמת אותי" או שלח לשמעון הודעה בפרטי.',
      flags: MessageFlags.Ephemeral
    });
  }

  try {
    await member.roles.add(VERIFIED_ROLE_ID);

    await db.collection('memberTracking').doc(member.id).set({
      joinedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      status: 'active',
      guildId: interaction.guild.id,
      dmSent: false,
      replied: false,
      dmFailed: false,
      activityWeight: 0,
      reminderCount: 0
    }, { merge: true });

    await db.collection(TRACKING_COLLECTION).doc(member.id).set({
      type: 'verification',
      status: 'pending',
      sentAt: new Date().toISOString(),
      guildId: interaction.guild.id
    });

    await interaction.reply({ content: '✅ אומתת בהצלחה! ברוך הבא 🎉', flags: MessageFlags.Ephemeral });

    logToWebhook({
      title: '🟢 אימות באמצעות כפתור',
      description: `<@${member.id}> אומת דרך כפתור האימות.`
    });

    if (staffChannel?.isTextBased()) {
      staffChannel.send(`🟢 <@${member.id}> אומת בהצלחה.`);
    }
    const { sendFallbackButton } = require('./dmFallbackModal');
    try {
      await user.send(
        '🎉 ברוך הבא ל־Gamers United IL!\n\n' +
        'אם אתה רואה רק אפור או מרגיש קצת אבוד – תכתוב לי כאן ואשמח לעזור. 💬'
      );
    } catch (err) {
      console.warn('⚠️ לא ניתן לשלוח DM לאחר אימות:', err.message);
      const channel = interaction.channel;
      if (channel?.isTextBased()) {
        await channel.send({
          content: `<@${user.id}> לא הצלחנו לשלוח לך הודעה בפרטי. תגיב כאן במקום:`,
          components: sendFallbackButton(user.id).components
        });
      }
    }
  } catch (err) {
    console.error('❌ שגיאה באימות:', err);
    await interaction.reply({
      content: '❌ משהו השתבש, נסה שוב או פנה למנהל.',
      flags: MessageFlags.Ephemeral
    });
  }
}

// --- נשאר ללא שינוי ---
async function scanForConsoleAndVerify(member) {
  const hasVerified = member.roles.cache.has(VERIFIED_ROLE_ID);
  if (hasVerified) {
    console.log(`🟡 ${member.user.tag} כבר אומת מראש – אין צורך בסריקה.`);
    return;
  }

  const presence = member.presence?.clientStatus;
  const statusKeys = presence ? Object.keys(presence) : [];

  const isConsoleLikely =
    !presence || (statusKeys.length === 1 && statusKeys[0] === 'web');

  if (!isConsoleLikely) {
    console.log(`🔺 ${member.user.tag} לא מזוהה כקונסוליסט – clientStatus:`, statusKeys);
    return;
  }

  try {
    await member.roles.add(VERIFIED_ROLE_ID);

    await db.collection('memberTracking').doc(member.id).set({
      joinedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      status: 'active',
      guildId: member.guild.id,
      dmSent: false,
      replied: false,
      dmFailed: false,
      activityWeight: 0,
      reminderCount: 0,
      verifiedBy: 'auto-console',
      autoReason: statusKeys.length === 0 ? 'no presence' : 'web only'
    }, { merge: true });

    await db.collection(TRACKING_COLLECTION).doc(member.id).set({
      type: 'verification',
      status: 'pending',
      sentAt: new Date().toISOString(),
      guildId: member.guild.id
    });

    const staffChannel = member.guild.channels.cache.get(STAFF_CHANNEL_ID);
    if (staffChannel?.isTextBased()) {
      staffChannel.send(`🎮 <@${member.id}> אומת אוטומטית כקונסוליסט (clientStatus: ${statusKeys.join(', ') || 'none'}).`);
    }

    logToWebhook({
      title: '🎮 אימות אוטומטי לפי סריקת קונסולה',
      description: `<@${member.id}> אומת לפי clientStatus: ${statusKeys.join(', ') || 'none'}`,
      color: 0x3498db
    });

    try {
      await member.user.send(
        '🎉 אומתת בהצלחה כקונסוליסט!\n\n' +
        'אם אתה רואה רק אפור – תכתוב לי כאן או תיכנס ל־#fifo-chat ותגיד שלום 🎮'
      );
    } catch (err) {
      console.warn(`⚠️ לא ניתן לשלוח DM לקונסוליסט ${member.user.tag}:`, err.message);
      const channel = member.guild.systemChannel;
      if (channel?.isTextBased()) {
        const { sendFallbackButton } = require('./dmFallbackModal');
        await channel.send({
          content: `<@${member.id}> לא הצלחנו לשלוח לך הודעה בפרטי. תגיב כאן במקום:`,
          components: sendFallbackButton(member.id).components
        });
      }
    }

    console.log(`✅ ${member.user.tag} אומת אוטומטית – זוהה כקונסוליסט (clientStatus: ${statusKeys.join(', ') || 'none'})`);
  } catch (err) {
    console.warn(`❌ שגיאה באימות קונסוליסט ${member.user.tag}:`, err.message);
  }
}

/**
 * בודק תגובות ממתינות ב-DM ושולח תזכורות.
 * פונקציה זו נקראת על ידי מתזמן מרכזי (cron).
 * @param {import('discord.js').Client} client 
 */
async function checkPendingDms(client) {
  const now = Date.now();
  const snapshot = await db.collection(TRACKING_COLLECTION)
    .where('type', '==', 'verification')
    .where('status', '==', 'pending')
    .get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const sentTime = new Date(data.sentAt).getTime();
    const userId = doc.id;

    const oneHour = 60 * 60 * 1000;
    const twentyFourHours = 24 * oneHour;

    if (data.reminderSent) {
      if (now - sentTime >= twentyFourHours) {
        await db.collection(TRACKING_COLLECTION).doc(userId).update({ status: 'ignored' });

        logToWebhook({
          title: '⏱️ לא התקבלה תגובה ל־DM (אימות)',
          description: `<@${userId}> לא הגיב להודעת האימות במשך 24 שעות.`,
          color: 0xf1c40f
        });

        const staffChannel = client.channels.cache.get(STAFF_CHANNEL_ID);
        if (staffChannel?.isTextBased()) {
          staffChannel.send(`⚠️ <@${userId}> לא הגיב להודעת האימות במשך 24 שעות.`);
        }
      }
      continue;
    }

    if (now - sentTime >= oneHour) {
      try {
        const user = await client.users.fetch(userId);
        const dm = await user.send(
          '👋 היי! רק מזכירים – אם משהו לא הסתדר, תוכל לכתוב לי כאן.\n\n' +
          'אם אתה עדיין רואה את השרת באפור – כנס לערוץ האימות ולחץ על הכפתור.\n\n' +
          `🔗 קישור ישיר לאימות:\nhttps://discord.com/channels/${data.guildId}/${VERIFICATION_CHANNEL_ID}`
        );

        await db.collection(TRACKING_COLLECTION).doc(userId).update({ reminderSent: true });

        const collector = dm.channel.createMessageCollector({
          filter: m => !m.author.bot,
          time: oneHour
        });

        collector.on('collect', async response => {
          const content = response.content.toLowerCase();
          const staffChannel = client.channels.cache.get(STAFF_CHANNEL_ID);
          const guild = client.guilds.cache.get(data.guildId);
          const member = await guild?.members.fetch(userId).catch(() => null);

          let status = '🔴 לא בשרת';
          let isVerified = false;

          if (member) {
            status = '🟢 בשרת';
            isVerified = member.roles.cache.has(VERIFIED_ROLE_ID);
            if (!isVerified) status = '🟠 לא מאומת';
          }

          const isNegative = ['עזוב', 'שחרר', 'לא רוצה', 'לא צריך'].some(w => content.includes(w));
          const isQuestion = ['מה', 'איך', 'צריך', 'לעשות'].some(w => content.includes(w));
          const isPositive = ['תודה', 'סבבה', 'בכיף', 'מעולה'].some(w => content.includes(w));

          let replyText = null;

          if (!member) {
            replyText = 'נראה שאתה כבר לא נמצא בשרת שלנו 😕\nאם תרצה לחזור — הנה קישור קבוע: https://discord.gg/2DGAwxDtKW';
          } else if (!isVerified) {
            replyText = 'אתה עדיין לא אומת לשרת שלנו 😅 תיכנס לערוץ הראשי ולחץ על כפתור האימות כדי להתחיל.';
          } else if (isNegative) {
            replyText = 'אין בעיה. רק שתדע — אם לא תהיה פעיל בהמשך, תוסר מהשרת 🙃';
          } else if (isQuestion) {
            replyText = 'פשוט תכתוב משהו בצ׳אט או תקפוץ לשיחה בקול. זה כל מה שצריך 🎧';
          } else if (isPositive) {
            replyText = 'תודה! תמיד כיף לראות חיוך מהצד השני של המסך ✌️';
          } else {
            replyText = 'קיבלתי. אני פה אם תצטרך עוד משהו 💬';
          }

          try {
            await response.channel.send(replyText);
          } catch (err) {
            console.warn(`⚠️ לא ניתן להשיב ל־${userId}:`, err.message);
          }

          await db.collection(TRACKING_COLLECTION).doc(userId).update({
            status: 'responded',
            response: response.content
          });

          if (staffChannel?.isTextBased()) {
            staffChannel.send(
              `📩 <@${userId}> הגיב ל־DM: ${response.content}\n` +
              `🧠 סטטוס: ${status}\n` +
              `🤖 שמעון ענה: ${replyText}`
            );
          }
        });

      } catch (err) {
        console.warn(`⚠️ לא ניתן לשלוח תזכורת ל־${userId}:`, err.message);
        await db.collection(TRACKING_COLLECTION).doc(userId).update({ status: 'ignored' });
      }
    }
  }
}

module.exports = {
  setupVerificationMessage,
  handleInteraction,
  scanForConsoleAndVerify,
  checkPendingDms
};