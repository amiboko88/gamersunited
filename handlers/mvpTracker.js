const admin = require('firebase-admin');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const Timestamp = admin.firestore.Timestamp;

const MVP_ROLE_NAME = '🏅 MVP';
const MVP_ANNOUNCE_CHANNEL = 'general';

// ⏱️ עדכון פעילות קולית
async function updateVoiceActivity(memberId, durationMinutes, db) {
  const userRef = db.doc(`voiceTime/${memberId}`);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    await userRef.set({ minutes: durationMinutes });
  } else {
    const data = userSnap.data();
    await userRef.update({ minutes: (data.minutes || 0) + durationMinutes });
  }
}

// 🏆 חישוב והכרזה
async function calculateAndAnnounceMVP(client, db) {
  const voiceRef = await db.collection('voiceTime').get();
  if (voiceRef.empty) return;

  let topUser = null;
  let maxMinutes = 0;

  voiceRef.forEach(doc => {
    const data = doc.data();
    if (data.minutes > maxMinutes) {
      maxMinutes = data.minutes;
      topUser = { id: doc.id, minutes: data.minutes };
    }
  });

  if (!topUser) return;

  const guild = client.guilds.cache.first();
  const member = await guild.members.fetch(topUser.id).catch(() => null);
  if (!member) return;

  let mvpRole = guild.roles.cache.find(r => r.name === MVP_ROLE_NAME);
  if (!mvpRole) {
    mvpRole = await guild.roles.create({
      name: MVP_ROLE_NAME,
      color: 'Gold',
      reason: 'תפקיד MVP שבועי'
    });
  }

  const allMembers = await guild.members.fetch();
  allMembers.forEach(m => {
    if (m.roles.cache.has(mvpRole.id)) {
      m.roles.remove(mvpRole);
    }
  });

  await member.roles.add(mvpRole);

  const statsRef = db.doc(`mvpStats/${topUser.id}`);
  const statsSnap = await statsRef.get();
  const wins = statsSnap.exists ? (statsSnap.data().wins || 0) + 1 : 1;
  await statsRef.set({ wins });

  const channel = guild.channels.cache.find(c =>
    c.name === MVP_ANNOUNCE_CHANNEL && c.isTextBased()
  );

  if (channel) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 MVP השבועי!')
      .setDescription(
        `מזל טוב ל־<@${topUser.id}> על **${topUser.minutes} דקות** של נוכחות 🎤!\n\nסה״כ זכיות: **${wins}**`
      )
      .setColor('Gold')
      .setTimestamp();

    await channel.send({ content: '@everyone', embeds: [embed] });
  }

  for (const docSnap of voiceRef.docs) {
    await db.doc(`voiceTime/${docSnap.id}`).update({ minutes: 0 });
  }

  await db.doc('mvpSystem/status').set({ lastCalculated: Timestamp.now() });
}

// 🕒 בדיקה שבועית
async function checkMVPStatusAndRun(client, db) {
  const statusRef = db.doc('mvpSystem/status');
  const statusSnap = await statusRef.get();

  const now = Timestamp.now();
  let shouldRun = false;

  if (!statusSnap.exists) {
    shouldRun = true;
  } else {
    const last = statusSnap.data().lastCalculated?.toDate() || new Date(0);
    const diff = now.toDate() - last;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;

    if (diff >= oneWeek || new Date().getDay() === 0) {
      shouldRun = true;
    }
  }

  if (shouldRun) {
    console.log('⏳ מחשב MVP שבועי...');
    await calculateAndAnnounceMVP(client, db);
  } else {
    console.log('✅ MVP כבר חושב השבוע.');
  }
}

// 📎 רישום Slash
function registerMvpCommand(commands) {
  commands.push(
    new SlashCommandBuilder()
      .setName('mvp')
      .setDescription('הפעלת חישוב MVP מיידי')
      .toJSON()
  );
}

// 🧩 טיפול ב־/mvp
async function handleMvpInteraction(interaction, client, db) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'mvp') return;

  await interaction.reply({
    content: '⏳ מחשב MVP...',
    ephemeral: true
  });

  await calculateAndAnnounceMVP(client, db);

  await interaction.editReply({
    content: '✅ MVP חושב ופורסם!'
  });
}

// ייצוא
module.exports = {
  updateVoiceActivity,
  calculateAndAnnounceMVP,
  checkMVPStatusAndRun,
  registerMvpCommand,
  handleMvpInteraction
};
