const db = require('../utils/firebase');

// הגדרות קבועות
const STAFF_CHANNEL_ID = '881445829100060723'; // ערוץ staff (אופציונלי)
const ADMIN_ROLE_ID = '1133753472966201555';
const GENERAL_CHANNEL_ID = '583575179880431616';
const INACTIVITY_DAYS = 30;

async function handleMemberButtons(interaction, client) {
  // --- שליחה יחידנית — DM ראשון ---
  if (interaction.customId.startsWith('send_dm_again_')) {
    const userId = interaction.customId.replace('send_dm_again_', '');
    try {
      const user = await client.users.fetch(userId);
      const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת חביבה עבור משתמש שטרם היה פעיל.`;
      const smartChat = require('../handlers/smartChat');
      const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
      await user.send(dm);
      await db.collection('memberTracking').doc(userId).set({
        dmSent: true,
        dmSentAt: new Date().toISOString(),
        reminderCount: 1
      }, { merge: true });
      await interaction.reply({ content: `✅ נשלחה תזכורת ל־<@${userId}>`, ephemeral: true });
    } catch (err) {
      await db.collection('memberTracking').doc(userId).set({
        dmFailed: true,
        dmFailedAt: new Date().toISOString()
      }, { merge: true });
      await interaction.reply({ content: `❌ לא ניתן לשלוח ל־<@${userId}>: ${err.message}`, ephemeral: true });
    }
    return true;
  }

  // --- שליחה יחידנית — DM אחרון ---
  if (interaction.customId.startsWith('send_final_dm_')) {
    const userId = interaction.customId.replace('send_final_dm_', '');
    try {
      const user = await client.users.fetch(userId);
      const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת אחרונה ומשעשעת למשתמש שהתעלם מהודעות קודמות.`;
      const smartChat = require('../handlers/smartChat');
      const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
      await user.send(dm);
      await db.collection('memberTracking').doc(userId).set({
        reminderCount: 3,
        dmSentAt: new Date().toISOString()
      }, { merge: true });
      await interaction.reply({ content: `📨 נשלחה תזכורת סופית ל־<@${userId}>`, ephemeral: true });
    } catch (err) {
      await db.collection('memberTracking').doc(userId).set({
        dmFailed: true,
        dmFailedAt: new Date().toISOString()
      }, { merge: true });
      await interaction.reply({ content: `❌ שגיאה בשליחה ל־<@${userId}>: ${err.message}`, ephemeral: true });
    }
    return true;
  }

  // --- שליחה קבוצתית — ראשונה ---
  if (interaction.customId === 'send_dm_batch_list') {
    await interaction.deferReply({ ephemeral: true });

    const allTracked = await db.collection('memberTracking').get();
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch();
    let staff = null;
    if (STAFF_CHANNEL_ID) {
      staff = await client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);
    }

    let count = 0;
    let failed = [];
    let notInGuild = [];

    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;

      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      // לא בשרת
      if (!members.has(userId)) {
        notInGuild.push(`<@${userId}>`);
        continue;
      }
      // לא עונה על תנאי חוסר פעילות
      if (!(daysInactive > INACTIVITY_DAYS && !d.dmSent)) {
        continue;
      }

      try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user || !user.id) throw new Error('User not found');
        try {
          const smartChat = require('../handlers/smartChat');
          const prompt = `אתה שמעון, בוט גיימרים ישראלי. כתוב תזכורת נעימה למשתמש לא פעיל חודש.`;
          const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
          await user.send(dm);

          await db.collection('memberTracking').doc(userId).set({
            dmSent: true,
            dmSentAt: new Date().toISOString(),
            reminderCount: 1
          }, { merge: true });

          if (staff?.isTextBased()) {
            await staff.send(`📨 נשלחה תזכורת ל־<@${userId}>`);
          }

          count++;
        } catch (dmErr) {
          failed.push(`<@${userId}>`);
          await db.collection('memberTracking').doc(userId).set({
            dmFailed: true,
            dmFailedAt: new Date().toISOString()
          }, { merge: true });
        }
      } catch (err) {
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({
          dmFailed: true,
          dmFailedAt: new Date().toISOString()
        }, { merge: true });
      }
    }

    // סיכום למי שלחץ על הכפתור
    let msg = `✅ נשלחו תזכורות ל־${count} משתמשים.`;
    if (notInGuild.length > 0) msg += `\n🚫 לא בשרת: ${notInGuild.join(', ')}`;
    if (failed.length > 0) msg += `\n❌ נכשלו DM (${failed.length}): ${failed.join(', ')}`;
    await interaction.editReply({ content: msg });

    // --- דיווח לכל האדמינים ב-DM ---
    if (failed.length > 0) {
      try {
        const admins = members.filter(m => m.roles.cache.has(ADMIN_ROLE_ID));
        const adminMsg =
          `👋 יש ${failed.length} משתמשים שלא ניתן לשלוח להם DM מהבוט (כנראה חוסמים DM):\n` +
          failed.join(', ') +
          `\n\nהם לא היו פעילים תקופה ממושכת, והם חסומים להתראה — שקלו להסיר אותם מהשרת!`;

        for (const [, adminMember] of admins) {
          try {
            await adminMember.send(adminMsg);
          } catch (e) { }
        }
      } catch (e) {
        console.error('שגיאה בשליחת DM לאדמין:', e.message);
      }

      // --- דיווח לערוץ הכללי ב-EMBED ---
      try {
        const generalChannel = await client.channels.fetch(GENERAL_CHANNEL_ID).catch(() => null);
        if (generalChannel && generalChannel.isTextBased()) {
          const { EmbedBuilder } = require('discord.js');
          const embed = new EmbedBuilder()
            .setTitle('🚨 מועמדים להסרה מהשרת')
            .setDescription(
              `**המשתמשים הבאים לא היו פעילים תקופה ממושכת וגם חסומים להודעות פרטיות מהבוט:**\n\n${failed.join(', ')}\n\nאם אתה ברשימה ורוצה להישאר — פנה להנהלה או אפשר DM מהשרת שלך!\n\n[מדריך לפתיחת DM](https://support.discord.com/hc/he/articles/217916488)`
            )
            .setColor(0xFF5C5C)
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/565/565547.png')
            .setFooter({ text: 'אזהרת מערכת אוטומטית', iconURL: 'https://cdn-icons-png.flaticon.com/512/565/565547.png' })
            .setTimestamp();
          await generalChannel.send({ embeds: [embed] });
        }
      } catch (e) {
        console.error('שגיאה בשליחת Embed לערוץ הכללי:', e.message);
      }
    }
    return true;
  }
  // --- שליחה קבוצתית — סופית (תזכורת אחרונה) ---
  if (interaction.customId === 'send_dm_batch_final_check') {
    await interaction.deferReply({ ephemeral: true });

    const allTracked = await db.collection('memberTracking').get();
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch();
    let staff = null;
    if (STAFF_CHANNEL_ID) {
      staff = await client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);
    }

    let count = 0;
    let failed = [];
    let notInGuild = [];

    const now = Date.now();

    for (const doc of allTracked.docs) {
      const d = doc.data();
      const userId = doc.id;

      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      // לא בשרת
      if (!members.has(userId)) {
        notInGuild.push(`<@${userId}>`);
        continue;
      }
      // עונה על התנאים: קיבל DM ראשוני, לא ענה, ועדיין לא פעיל
      if (!(daysInactive > INACTIVITY_DAYS && d.dmSent && !d.replied)) {
        continue;
      }

      try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user || !user.id) throw new Error('User not found');
        try {
          const smartChat = require('../handlers/smartChat');
          const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת סופית ומשעשעת למשתמש שהתעלם מהודעות קודמות.`;
          const dm = await smartChat.smartRespond({ content: '', author: user }, 'שובב', prompt);
          await user.send(dm);

          await db.collection('memberTracking').doc(userId).set({
            reminderCount: 3,
            dmSentAt: new Date().toISOString()
          }, { merge: true });

          if (staff?.isTextBased()) {
            await staff.send(`📨 נשלחה תזכורת סופית ל־<@${userId}>`);
          }

          count++;
        } catch (dmErr) {
          failed.push(`<@${userId}>`);
          await db.collection('memberTracking').doc(userId).set({
            dmFailed: true,
            dmFailedAt: new Date().toISOString()
          }, { merge: true });
        }
      } catch (err) {
        failed.push(`<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({
          dmFailed: true,
          dmFailedAt: new Date().toISOString()
        }, { merge: true });
      }
    }

    let msg = `📨 נשלחו תזכורות סופיות ל־${count} משתמשים.`;
    if (notInGuild.length > 0) msg += `\n🚫 לא בשרת: ${notInGuild.join(', ')}`;
    if (failed.length > 0) msg += `\n❌ נכשלו DM (${failed.length}): ${failed.join(', ')}`;
    await interaction.editReply({ content: msg });

    // --- דיווח לכל האדמינים ב-DM ---
    if (failed.length > 0) {
      try {
        const admins = members.filter(m => m.roles.cache.has(ADMIN_ROLE_ID));
        const adminMsg =
          `👋 (סופי) יש ${failed.length} משתמשים שלא ניתן לשלוח להם DM מהבוט (כנראה חוסמים DM):\n` +
          failed.join(', ') +
          `\n\nהם לא היו פעילים תקופה ממושכת, ולא ענו גם לתזכורת סופית — שקלו להסיר אותם מהשרת!`;

        for (const [, adminMember] of admins) {
          try {
            await adminMember.send(adminMsg);
          } catch (e) { }
        }
      } catch (e) {
        console.error('שגיאה בשליחת DM לאדמין:', e.message);
      }

      // --- דיווח לערוץ הכללי ב-EMBED ---
      try {
        const generalChannel = await client.channels.fetch(GENERAL_CHANNEL_ID).catch(() => null);
        if (generalChannel && generalChannel.isTextBased()) {
          const { EmbedBuilder } = require('discord.js');
          const embed = new EmbedBuilder()
            .setTitle('🚨 מועמדים להסרה מהשרת (תזכורת סופית)')
            .setDescription(
              `**המשתמשים הבאים לא היו פעילים זמן רב, חסומים להודעות פרטיות מהבוט, ולא ענו לתזכורות קודמות:**\n\n${failed.join(', ')}\n\nאם אתה ברשימה ורוצה להישאר — פנה להנהלה או אפשר DM מהשרת שלך!\n\n[מדריך לפתיחת DM](https://support.discord.com/hc/he/articles/217916488)`
            )
            .setColor(0xFF5C5C)
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/565/565547.png')
            .setFooter({ text: 'אזהרת מערכת אוטומטית', iconURL: 'https://cdn-icons-png.flaticon.com/512/565/565547.png' })
            .setTimestamp();
          await generalChannel.send({ embeds: [embed] });
        }
      } catch (e) {
        console.error('שגיאה בשליחת Embed לערוץ הכללי:', e.message);
      }
    }

    return true;
  }

  // --- אם לא אחד מהכפתורים שלנו — לא לטפל ---
  return false;
}

module.exports = { handleMemberButtons };

