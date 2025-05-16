const admin = require('firebase-admin');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { log } = require('../utils/logger');

const Timestamp = admin.firestore.Timestamp;

const MVP_ROLE_ID = process.env.ROLE_MVP_ID; // ← מזהה לפי ID
const MVP_ANNOUNCE_CHANNEL = 'general';

async function updateVoiceActivity(memberId, durationMinutes, db) {
  const userRef = db.doc(`voiceTime/${memberId}`);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    await userRef.set({ minutes: durationMinutes });
  } else {
    const data = userSnap.data();
    await userRef.update({ minutes: (data.minutes || 0) + durationMinutes });
  }

  log(`📈 עדכון פעילות ל־${memberId}: ${durationMinutes} דקות`);
}

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

  const mvpRole = guild.roles.cache.get(MVP_ROLE_ID);
  if (!mvpRole) {
    log(`❌ לא נמצא תפקיד MVP לפי ID: ${MVP_ROLE_ID}`);
    return;
  }

  try {
    const allMembers = await guild.members.fetch({ time: 10000 });
    allMembers.forEach(m => {
      if (m.roles.cache.has(mvpRole.id)) {
        m.roles.remove(mvpRole).catch(() => {});
      }
    });
  } catch (err) {
    if (err.code === 'GuildMembersTimeout') {
      log(`⚠️ לא ניתן לטעון את כל המשתמשים בשרת (MVP): ${guild.name} – ${err.code}`);
    } else {
      log(`❌ שגיאה בטעינת משתמשים ל־MVP: ${guild.name}`);
      console.error(err);
    }
  }

  await member.roles.add(mvpRole).catch(() => {});

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

    await channel.send({ content: '@everyone', embeds: [embed] }).catch(() => {});
  }

  for (const docSnap of voiceRef.docs) {
    await db.doc(`voiceTime/${docSnap.id}`).update({ minutes: 0 }).catch(() => {});
  }

  await db.doc('mvpSystem/status').set({ lastCalculated: Timestamp.now() });
}

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
    log('⏳ מחשב MVP שבועי...');
    await calculateAndAnnounceMVP(client, db);
  } else {
    log('✅ MVP כבר חושב השבוע.');
  }
}

function registerMvpCommand(commands) {
  commands.push(
    new SlashCommandBuilder()
      .setName('mvp')
      .setDescription('הפעלת חישוב MVP מיידי')
      .toJSON()
  );
}

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

module.exports = {
  updateVoiceActivity,
  calculateAndAnnounceMVP,
  checkMVPStatusAndRun,
  registerMvpCommand,
  handleMvpInteraction
};
