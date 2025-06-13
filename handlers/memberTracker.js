// 📁 handlers/memberTracker.js - גרסה משודרגת ומלאה
const cron = require('node-cron');
const db = require('../utils/firebase');
const statTracker = require('./statTracker');
const { smartRespond } = require('./smartChat');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

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
  cron.schedule('0 20 * * 0', () => remindAgainCommand.execute({ deferReply: () => {}, client }));
}

const inactivityCommand = {
  data: new SlashCommandBuilder()
    .setName('inactive_list')
    .setDescription('📋 הצג משתמשים שלא היו פעילים מעל 30 ימים'),
  execute: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const now = Date.now();
    const allTracked = await db.collection('memberTracking').get();

    const inactiveUsers = allTracked.docs.filter(doc => {
      const last = new Date(doc.data().lastActivity || doc.data().joinedAt);
      return (now - last.getTime()) / 86400000 > INACTIVITY_DAYS;
    });

    if (inactiveUsers.length === 0) {
      return interaction.editReply('✅ כל המשתמשים פעילים לאחרונה.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 משתמשים לא פעילים מעל חודש')
      .setColor(0xff8800)
      .setTimestamp();

    for (const doc of inactiveUsers.slice(0, 25)) {
      embed.addFields({
        name: `<@${doc.id}>`,
        value: `Last: ${doc.data().lastActivity?.split('T')[0] || 'לא ידוע'}, DM sent: ${doc.data().dmSent ? '✅' : '❌'}`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};

const finalCheckCommand = {
  data: new SlashCommandBuilder()
    .setName('inactive_final_check')
    .setDescription('📛 הצג משתמשים שלא היו פעילים, קיבלו הודעה – ולא ענו'),
  execute: async interaction => {
    await interaction.deferReply({ ephemeral: true });
    const now = Date.now();
    const tracked = await db.collection('memberTracking').get();
    const guild = await interaction.client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    const inactive = tracked.docs.filter(doc => {
      const d = doc.data();
      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      return (
        daysInactive > INACTIVITY_DAYS &&
        d.dmSent === true &&
        d.replied === false &&
        members.has(doc.id)
      );
    });

    if (inactive.length === 0) {
      return interaction.editReply('✅ אין משתמשים שנכשלו בתגובה אחרי DM.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📛 משתמשים לא פעילים (קיבלו DM ולא ענו)')
      .setColor(0xff3333)
      .setTimestamp();

    inactive.slice(0, 25).forEach(doc => {
      const d = doc.data();
      embed.addFields({
        name: `<@${doc.id}>`,
        value: `Last Active: ${d.lastActivity?.split('T')[0] || 'N/A'}, DM sent at: ${d.dmSentAt?.split('T')[0] || 'N/A'}`,
        inline: false
      });
    });

    await interaction.editReply({ embeds: [embed] });
  }
};

const remindAgainCommand = {
  data: new SlashCommandBuilder()
    .setName('remind_again')
    .setDescription('🔁 שלח שוב הודעת DM למשתמשים שהתעלמו מהתזכורת הקודמת'),
  execute: async interaction => {
    if (interaction.deferReply) await interaction.deferReply({ ephemeral: true });
    const now = Date.now();
    const tracked = await db.collection('memberTracking').get();
    const guild = await interaction.client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();
    const staff = await interaction.client.channels.fetch(STAFF_CHANNEL_ID);
    let count = 0;
    let skipped = [];

    for (const doc of tracked.docs) {
      const d = doc.data();
      const userId = doc.id;
      const last = new Date(d.lastActivity || d.joinedAt);
      const daysInactive = (now - last.getTime()) / 86400000;

      if (
        daysInactive > INACTIVITY_DAYS &&
        d.dmSent === true &&
        d.replied === false &&
        members.has(userId)
      ) {
        if ((d.reminderCount || 1) >= 3) {
          skipped.push(`<@${userId}> | ${d.reminderCount} תזכורות`);
          continue;
        }
        try {
          const user = await interaction.client.users.fetch(userId);
          const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב הודעה שנייה או שלישית בהתאם למספר התזכורות שנשלחו בעבר.`;
          const dm = await smartRespond({ content: '', author: user }, 'שובב', prompt);
          await user.send(dm);
          count++;

          if (staff?.isTextBased()) {
            await staff.send(`📬 נשלחה תזכורת נוספת ל־<@${userId}>`);
          }

          await db.collection('memberTracking').doc(userId).set({
            reminderCount: (d.reminderCount || 1) + 1
          }, { merge: true });

        } catch (err) {
          console.warn(`⚠️ שגיאה בשליחת תזכורת נוספת ל־${userId}: ${err.message}`);
        }
      }
    }

    if (interaction.editReply) {
      const baseMsg = `🔁 נשלחו ${count} תזכורות נוספות למשתמשים שלא הגיבו.`;
      const skippedMsg = skipped.length > 0 ? `\n\n⛔ הועברו ${skipped.length} משתמשים לרשימת מעקב סופית:\n` + skipped.slice(0, 20).join('\n') : '';
      await interaction.editReply(baseMsg + skippedMsg);
    }
  }
};

module.exports = {
  setupMemberTracker,
  runInactivityScan,
  inactivityCommand,
  finalCheckCommand,
  remindAgainCommand
};
