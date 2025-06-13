// 📁 handlers/memberTracker.js - גרסה משודרגת עם סטטיסטיקות וניהול מתקדם
const cron = require('node-cron');
const db = require('../utils/firebase');
const statTracker = require('./statTracker');
const { smartRespond } = require('./smartChat');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const STAFF_CHANNEL_ID = '881445829100060723';
const GUILD_ID = process.env.GUILD_ID;
const INACTIVITY_DAYS = 30;

function setupMemberTracker(client) {
  // ✅ כל משתמש חדש נרשם למסד הנתונים
  client.on('guildMemberAdd', async member => {
    if (member.user.bot) return;
    await db.collection('memberTracking').doc(member.id).set({
      joinedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      dmSent: false,
      replied: false
    });
    console.log(`👤 נוסף משתמש חדש: ${member.displayName}`);
  });

  // ✅ כניסה לערוץ קול
  client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member;
    if (!member?.user || member.user.bot) return;
    db.collection('memberTracking').doc(member.id).set({
      lastActivity: new Date().toISOString()
    }, { merge: true });
  });

  // ✅ שליחת הודעה פרטית → זיהוי תגובה
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

  // ✅ סריקת משתמשים לא פעילים פעם ביום
  cron.schedule('0 3 * * *', async () => {
    console.log('📋 סריקת משתמשים לא פעילים...');
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
        dmSentAt: new Date().toISOString()
      }, { merge: true });

      await statTracker.trackInactivity?.(userId); // פונקציה אופציונלית לסטטיסטיקה
    }
  });
}

// 🔧 פקודת Slash ניהולית להצגת משתמשים לא פעילים
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
    await interaction.deferReply({ ephemeral: true });
    const now = Date.now();
    const tracked = await db.collection('memberTracking').get();
    const guild = await interaction.client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();
    const staff = await interaction.client.channels.fetch(STAFF_CHANNEL_ID);

    let count = 0;
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
        try {
          const user = await interaction.client.users.fetch(userId);
          const prompt = `אתה שמעון, בוט גיימרים ישראלי. תכתוב הודעה שנייה בעדינות למשתמש שלא ענה למרות תזכורת על חוסר פעילות.`;
          const dm = await smartRespond({ content: '', author: user }, 'שובב', prompt);
          await user.send(dm);
          count++;

          if (staff?.isTextBased()) {
            await staff.send(`📬 נשלחה תזכורת שנייה ל־<@${userId}>`);
          }
        } catch (err) {
          console.warn(`⚠️ שגיאה בשליחת תזכורת שנייה ל־${userId}: ${err.message}`);
        }
      }
    }

    await interaction.editReply(`🔁 נשלחו ${count} תזכורות שניות למשתמשים שלא הגיבו.`);
  }
};

module.exports = {
  setupMemberTracker,
  inactivityCommand,
  finalCheckCommand,
  remindAgainCommand
};
