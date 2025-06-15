// 📁 handlers/memberTracker.js - גרסה משודרגת ומלאה
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
    const lastActivity = new Date(data.lastActivity || data.joinedAt);
    const daysInactive = (now - lastActivity.getTime()) / 86400000;

    if (daysInactive < INACTIVITY_DAYS || data.dmSent) continue;

    let user;
    try {
      user = await client.users.fetch(userId);
      if (!user || !user.id) throw new Error('לא קיים');
    } catch (err) {
      console.warn(`⚠️ לא הצלחתי להביא את המשתמש ${userId}: ${err.message}`);
      continue;
    }

    try {
      const prompt = `אתה שמעון, בוט גיימרים ישראלי. כתוב הודעה משעשעת בעברית עבור משתמש שנמצא בקהילה אבל לא היה פעיל חודש.`;
      const dm = await smartRespond({ content: '', author: user }, 'שובב', prompt);
      await user.send(dm);
      console.log(`📨 נשלחה הודעת DM ל־${user.username}`);
    } catch (err) {
      console.warn(`⚠️ שגיאה בשליחת DM ל־${userId}:`, err.message);
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

function setupMemberTracker(client) {
  client.on('ready', async () => {
    const doc = await db.collection('system').doc('lastInactivityScan').get();
    const last = doc.exists ? doc.data().timestamp : 0;
    const now = Date.now();
    if ((now - last) > 1000 * 60 * 60 * 25) {
      console.log('🔄 לא זוהתה סריקה ב־24 שעות. מריץ רטרואקטיבית...');
      await runInactivityScan(client);
    }
  });

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

      const staff = await client.channels.fetch(STAFF_CHANNEL_ID);
      if (staff?.isTextBased()) {
        await staff.send(`📨 המשתמש <@${userId}> הגיב להודעת ה-DM:\n"${message.content}"`);
      }

      const autoResponse = await smartRespond(message, 'מפרגן');
      await message.channel.send(autoResponse);
    }
  });

  cron.schedule('0 3 * * *', () => runInactivityScan(client));
}

// === פונקציות תתי־הפקודות ===

async function runManualScan(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await runInactivityScan(interaction.client);
  await interaction.editReply('✅ הסריקה הסתיימה.');
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
    embed.addFields({ name: `${username} (<@${userId}>)`, value: `🗓️ ${date}\n💬 "${text}"`, inline: false });
  }
  await interaction.editReply({ embeds: [embed] });
}

async function runList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const now = Date.now();
  const allTracked = await db.collection('memberTracking').get();
  const client = interaction.client;

  const inactiveUsers = allTracked.docs.filter(doc => {
    const last = new Date(doc.data().lastActivity || doc.data().joinedAt);
    return (now - last.getTime()) / 86400000 > INACTIVITY_DAYS;
  });

  if (inactiveUsers.length === 0) {
    return interaction.editReply('✅ כל המשתמשים פעילים לאחרונה.');
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 משתמשים לא פעילים מעל חודש')
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
      value: `📆 פעילות אחרונה: ${data.lastActivity?.split('T')[0] || 'לא ידוע'}\n✉️ DM נשלח: ${data.dmSent ? '✅' : '❌'}`,
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
  const rows = [];

  const inactive = tracked.docs.filter(doc => {
    const d = doc.data();
    const last = new Date(d.lastActivity || d.joinedAt);
    const daysInactive = (now - last.getTime()) / 86400000;
    return daysInactive > INACTIVITY_DAYS && d.dmSent && !d.replied && members.has(doc.id);
  });

  for (const doc of inactive.slice(0, 5)) {
    const userId = doc.id;
    const d = doc.data();
    let username = `לא ידוע (${userId})`;
    try {
      const user = await interaction.client.users.fetch(userId);
      username = user.username;
    } catch {}

    embed.addFields({
      name: `${username} (<@${userId}>)`,
      value: `📆 אחרון: ${d.lastActivity?.split('T')[0] || 'N/A'}\n📬 נשלח: ${d.dmSentAt?.split('T')[0] || 'N/A'}`,
      inline: false
    });

    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`send_final_dm_${userId}`)
        .setLabel('📨 שלח שוב')
        .setStyle(ButtonStyle.Danger)
    ));
  }

  await interaction.editReply({ embeds: [embed], components: rows });
}

async function runRemindAgain(interaction) {
  if (interaction.deferReply) await interaction.deferReply({ ephemeral: true });
  const now = Date.now();
  const tracked = await db.collection('memberTracking').get();
  const guild = await interaction.client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();
  const staff = await interaction.client.channels.fetch(STAFF_CHANNEL_ID);
  const embed = new EmbedBuilder().setTitle('🔁 דו״ח שליחת תזכורות').setColor(0x00ccff).setTimestamp();

  let sent = 0, skipped = 0, failed = 0;

  for (const doc of tracked.docs) {
    const d = doc.data();
    const userId = doc.id;
    const last = new Date(d.lastActivity || d.joinedAt);
    const daysInactive = (now - last.getTime()) / 86400000;

    if (daysInactive > INACTIVITY_DAYS && d.dmSent && !d.replied && members.has(userId)) {
      const reminders = d.reminderCount || 1;
      if (reminders >= 3) {
        skipped++;
        embed.addFields({ name: `⛔ <@${userId}>`, value: `כבר נשלחו ${reminders} תזכורות.`, inline: false });
        continue;
      }

      try {
        const user = await interaction.client.users.fetch(userId);
        const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב תזכורת ${reminders + 1} (מתוך 3) למשתמש שלא ענה.`;
        const dm = await smartRespond({ content: '', author: user }, 'שובב', prompt);
        await user.send(dm);
        sent++;
        embed.addFields({ name: `✅ <@${userId}>`, value: `נשלחה תזכורת מספר ${reminders + 1}`, inline: false });
        if (staff?.isTextBased()) await staff.send(`📬 נשלחה תזכורת ל־<@${userId}>`);
        await db.collection('memberTracking').doc(userId).set({
          reminderCount: reminders + 1,
          dmSentAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        failed++;
        embed.addFields({ name: `❌ <@${userId}>`, value: `שגיאה: ${err.message}`, inline: false });
      }
    }
  }

  embed.setFooter({ text: `סה״כ: נשלחו ${sent}, דילוגים ${skipped}, נכשלו ${failed}` });
  if (interaction.editReply) await interaction.editReply({ embeds: [embed] });
}

// === SLASH COMMAND EXPORT ===

const inactivityCommand = {
  data: new SlashCommandBuilder()
    .setName('inactivity')
    .setDescription('🔍 ניהול משתמשים לא פעילים')
    .addSubcommand(sub => sub.setName('list').setDescription('📋 הצג משתמשים לא פעילים מעל חודש'))
    .addSubcommand(sub => sub.setName('final_check').setDescription('📛 קיבלו הודעה ולא הגיבו'))
    .addSubcommand(sub => sub.setName('remind').setDescription('🔁 שלח שוב למשתמשים שהתעלמו'))
    .addSubcommand(sub => sub.setName('replied').setDescription('📨 הצג מי שענה ל־DM'))
    .addSubcommand(sub => sub.setName('manual_scan').setDescription('🛠️ הרץ סריקה ידנית למשלוח DM')),

  execute: async interaction => {
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') return await runList(interaction);
    if (sub === 'final_check') return await runFinalCheck(interaction);
    if (sub === 'remind') return await runRemindAgain(interaction);
    if (sub === 'replied') return await runRepliedList(interaction);
    if (sub === 'manual_scan') return await runManualScan(interaction);
  }
};

module.exports = {
  setupMemberTracker,
  runInactivityScan,
  inactivityCommand
};
