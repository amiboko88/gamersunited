// 📁 handlers/memberTracker.js
const cron = require('node-cron');
const db = require('../utils/firebase');
const statTracker = require('./statTracker');
const { smartRespond } = require('./smartChat');
const {
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const STAFF_CHANNEL_ID = '881445829100060723';
const GUILD_ID = process.env.GUILD_ID;
const INACTIVITY_DAYS = 30;

function setupMemberTracker(client) {
  client.on('guildMemberAdd', async member => {
    if (member.user.bot) return;
    await db.collection('memberTracking').doc(member.id).set({
      joinedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      dmSent: false,
      replied: false,
      reminderCount: 0
    });
    console.log(`👤 נוסף משתמש חדש: ${member.displayName}`);
  });

  client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member;
    if (!member?.user || member.user.bot) return;
    db.collection('memberTracking').doc(member.id).set({
      lastActivity: new Date().toISOString()
    }, { merge: true });
  });

  client.on('messageCreate', async message => {
    if (!message.guild && !message.author.bot) {
      const userId = message.author.id;
      const ref = db.collection('memberTracking').doc(userId);
      await ref.set({
        replied: true,
        replyAt: new Date().toISOString(),
        replyText: message.content
      }, { merge: true });

      const staff = await message.client.channels.fetch(STAFF_CHANNEL_ID);
      if (staff?.isTextBased()) {
        await staff.send(`📨 המשתמש <@${userId}> הגיב להודעת ה-DM:\n"${message.content}"`);
      }

      const autoResponse = await smartRespond(message, 'מפרגן');
      await message.channel.send(autoResponse);
    }
  });

  cron.schedule('0 3 * * *', () => runInactivityScan(client));
}

async function runInactivityScan(client) {
  console.log('📋 הרצת סריקת משתמשים לא פעילים...');
  const guild = await client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();
  const now = Date.now();
  const allTracked = await db.collection('memberTracking').get();
  const staff = await client.channels.fetch(STAFF_CHANNEL_ID);

  for (const doc of allTracked.docs) {
    const userId = doc.id;
    const data = doc.data();

    // תיקון joinedAt חסר
    let joinedAt = data.joinedAt;
    if (!joinedAt) {
      const member = members.get(userId);
      joinedAt = member?.joinedAt?.toISOString() || new Date().toISOString();
      await db.collection('memberTracking').doc(userId).set({ joinedAt }, { merge: true });
      console.log(`🛠️ עודכן joinedAt עבור ${userId}`);
    }

    const lastActivity = new Date(data.lastActivity || joinedAt);
    const daysInactive = (now - lastActivity.getTime()) / 86400000;

    if (daysInactive < INACTIVITY_DAYS || data.dmSent || data.dmFailed) continue;

    let user;
    try {
      user = await client.users.fetch(userId);
      if (!user || typeof user.send !== 'function') throw new Error('לא קיים');
    } catch (err) {
      console.warn(`⚠️ לא הצלחתי להביא את המשתמש ${userId}: ${err.message}`);
      await db.collection('memberTracking').doc(userId).set({
        dmFailed: true,
        dmFailedAt: new Date().toISOString()
      }, { merge: true });
      continue;
    }

    try {
      const prompt = `אתה שמעון, בוט גיימרים ישראלי. כתוב הודעה משעשעת בעברית עבור משתמש שנמצא בקהילה אבל לא היה פעיל חודש.`;
      const dm = await smartRespond({ content: '', author: user }, 'שובב', prompt);
      await user.send(dm);
      console.log(`📨 נשלחה הודעת DM ל־${user.username}`);
    } catch (err) {
      console.warn(`⚠️ שגיאה בשליחת DM ל־${userId}: ${err.message}`);
      await db.collection('memberTracking').doc(userId).set({
        dmFailed: true,
        dmFailedAt: new Date().toISOString()
      }, { merge: true });
      continue;
    }

    if (staff?.isTextBased()) {
      await staff.send(`🚨 משתמש <@${userId}> לא פעיל חודש. נשלחה לו הודעה.`);
    }

    await db.collection('memberTracking').doc(userId).set({
      dmSent: true,
      dmSentAt: new Date().toISOString(),
      reminderCount: 1
    }, { merge: true });

    await statTracker.trackInactivity?.(userId);
  }

  await db.collection('system').doc('lastInactivityScan').set({ timestamp: now });
}

async function runList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const now = Date.now();
  const allTracked = await db.collection('memberTracking').get();
  const client = interaction.client;

  const inactiveUsers = allTracked.docs.filter(doc => {
    const last = new Date(doc.data().lastActivity || doc.data().joinedAt);
    return (now - last.getTime()) / 86400000 > INACTIVITY_DAYS && !doc.data().dmSent && !doc.data().dmFailed;
  });

  if (inactiveUsers.length === 0) {
    return interaction.editReply('✅ אין משתמשים שטרם קיבלו DM.');
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 משתמשים לא פעילים (טרם נשלח DM)')
    .setColor(0xffaa00)
    .setTimestamp();

  for (const doc of inactiveUsers.slice(0, 25)) {
    const userId = doc.id;
    const data = doc.data();
    let username = `לא ידוע (${userId})`;
    try {
      const user = await client.users.fetch(userId);
      username = user.username;
    } catch {}

    embed.addFields({
      name: `${username} (<@${userId}>)`,
      value: `📆 פעילות אחרונה: ${data.lastActivity?.split('T')[0] || 'לא ידוע'}\n✉️ DM נשלח: ❌`,
      inline: false
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('send_dm_batch_list')
      .setLabel('📨 שלח תזכורת לכולם')
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function runFinalCheck(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const now = Date.now();
  const tracked = await db.collection('memberTracking').get();
  const guild = await interaction.client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();
  const embed = new EmbedBuilder().setTitle('📛 משתמשים שלא ענו ל־DM').setColor(0xff4444).setTimestamp();

  const inactive = tracked.docs.filter(doc => {
    const d = doc.data();
    const last = new Date(d.lastActivity || d.joinedAt);
    const daysInactive = (now - last.getTime()) / 86400000;
    return daysInactive > INACTIVITY_DAYS && d.dmSent && !d.replied && members.has(doc.id);
  });

  if (inactive.length === 0) {
    return interaction.editReply('✅ אין משתמשים שלא הגיבו.');
  }

  for (const doc of inactive.slice(0, 25)) {
    const userId = doc.id;
    const d = doc.data();
    let username = `לא ידוע (${userId})`;
    try {
      const user = await interaction.client.users.fetch(userId);
      username = user.username;
    } catch {}

    embed.addFields({
      name: `${username} (<@${userId}>)`,
      value: `📆 פעילות אחרונה: ${d.lastActivity?.split('T')[0] || 'N/A'}\n📬 נשלח: ${d.dmSentAt?.split('T')[0] || 'N/A'}`,
      inline: false
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('send_dm_batch_final_check')
      .setLabel('📨 שלח שוב לכולם')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function runRepliedList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const allTracked = await db.collection('memberTracking').get();
  const client = interaction.client;
  const replied = allTracked.docs.filter(doc => doc.data().replied === true);
  if (replied.length === 0) return interaction.editReply('😴 אף משתמש עדיין לא הגיב ל־DM.');
  const embed = new EmbedBuilder().setTitle('📨 משתמשים שענו ל־DM').setColor(0x33cc99).setTimestamp();
  for (const doc of replied.slice(0, 25)) {
    const data = doc.data();
    const userId = doc.id;
    let username = `לא ידוע (${userId})`;
    try {
      const user = await client.users.fetch(userId);
      username = user.username;
    } catch {}
    const text = data.replyText?.slice(0, 100) || '---';
    const date = data.replyAt?.split('T')[0] || 'לא ידוע';
    embed.addFields({ name: `${username} (<@${userId}>)`, value: `🗓️ תאריך תגובה: ${date}\n💬 "${text}"`, inline: false });
  }
  await interaction.editReply({ embeds: [embed] });
}

async function runFailedList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const allTracked = await db.collection('memberTracking').get();
  const client = interaction.client;
  const failed = allTracked.docs.filter(doc => doc.data().dmFailed === true);

  if (failed.length === 0) {
    return interaction.editReply('✅ אין משתמשים עם DM שנכשל.');
  }

  const embed = new EmbedBuilder()
    .setTitle('❌ משתמשים שחסמו DM מהבוט או לא נגישים')
    .setColor(0xcc0000)
    .setTimestamp();

  for (const doc of failed.slice(0, 25)) {
    const userId = doc.id;
    const data = doc.data();
    let username = `לא ידוע (${userId})`;

    try {
      const user = await client.users.fetch(userId);
      username = user.username;
    } catch {}

    embed.addFields({
      name: `${username} (<@${userId}>)`,
      value: `📆 כישלון תיעוד: ${data.dmFailedAt?.split('T')[0] || 'N/A'}`,
      inline: false
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function runKickFailed(interaction) {
  const member = interaction.member;

  if (!member.permissions.has('Administrator')) {
    return await interaction.reply({
      content: '❌ הפקודה הזו זמינה רק לאדמינים עם הרשאת ADMINISTRATOR.',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });
  const tracked = await db.collection('memberTracking').get();
  const failedDocs = tracked.docs.filter(doc => doc.data().dmFailed === true);

  if (failedDocs.length === 0) {
    return interaction.editReply('✅ אין משתמשים לסילוק.');
  }

  const guild = await interaction.client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();

  let kicked = 0;
  let notInGuild = 0;
  let failedToKick = [];

  for (const doc of failedDocs) {
    const userId = doc.id;
    const memberToKick = members.get(userId);

    if (!memberToKick) {
      notInGuild++;
      await db.collection('memberTracking').doc(userId).delete();
      continue;
    }

    try {
      await memberToKick.kick('סומן כ־dmFailed ולא ענה');
      await db.collection('memberTracking').doc(userId).delete();
      kicked++;
    } catch (err) {
      failedToKick.push(`<@${userId}>`);
    }
  }

  // דיווח לצוות
  try {
    const staff = await interaction.client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);
    if (staff?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 פעולת ניקוי משתמשים לא זמינים')
        .setColor(0xff4444)
        .addFields(
          { name: '✅ הורחקו מהשרת', value: `${kicked}`, inline: true },
          { name: '🚫 כבר לא היו בשרת', value: `${notInGuild}`, inline: true },
          { name: '❌ שגיאות בהרחקה', value: failedToKick.length > 0 ? failedToKick.join(', ') : 'אין', inline: false }
        )
        .setFooter({ text: `הופעל ע״י ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();

      await staff.send({ embeds: [embed] });
    }
  } catch (e) {
    console.error('שגיאה בשליחת Embed לצוות:', e.message);
  }

  let msg = `🧹 **ניקוי הושלם:**\n✅ הורחקו: ${kicked}\n🚫 לא היו בשרת: ${notInGuild}`;
  if (failedToKick.length > 0) msg += `\n❌ נכשלו בהרחקה: ${failedToKick.join(', ')}`;
  await interaction.editReply(msg);
}

async function runPanel(interaction) {
  const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

  const embed = new EmbedBuilder()
    .setTitle('📋 לוח ניהול משתמשים לא פעילים')
    .setDescription('בחר באחת מהפעולות הבאות כדי לנהל משתמשים שלא היו פעילים לאחרונה.')
    .setColor(0x007acc)
    .setFooter({ text: 'Shimon BOT — Inactivity Manager' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('send_dm_batch_list')
      .setLabel('📨 שלח DM לכולם')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('send_dm_batch_final_check')
      .setLabel('🚨 שלח תזכורת סופית')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true
  });
}

const inactivityCommand = {
  data: new SlashCommandBuilder()
    .setName('inactivity')
    .setDescription('🔍 ניהול משתמשים לא פעילים')
    .addSubcommand(sub => sub.setName('list').setDescription('📋 הצג משתמשים שטרם קיבלו DM'))
    .addSubcommand(sub => sub.setName('not_replied').setDescription('📛 קיבלו DM ולא ענו'))
    .addSubcommand(sub => sub.setName('replied').setDescription('📨 הצג מי שענה ל־DM'))
    .addSubcommand(sub => sub.setName('failed_list').setDescription('❌ הצג משתמשים שנכשל DM אליהם'))
    .addSubcommand(sub => sub.setName('kick_failed').setDescription('🛑 העף ומחק משתמשים שנכשלו DM (Admin בלבד)'))
    .addSubcommand(sub => sub.setName('panel').setDescription('📋 פתח לוח ניהול משתמשים')),
    
  execute: async interaction => {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') return await runList(interaction);
    if (sub === 'not_replied') return await runFinalCheck(interaction);
    if (sub === 'replied') return await runRepliedList(interaction);
    if (sub === 'failed_list') return await runFailedList(interaction);
    if (sub === 'kick_failed') return await runKickFailed(interaction);
    if (sub === 'panel') return await runPanel(interaction);
  }
};

module.exports = {
  setupMemberTracker,
  runInactivityScan,
  inactivityCommand
};
