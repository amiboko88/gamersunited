const { Timestamp, doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { EmbedBuilder } = require('discord.js');

const MVP_ROLE_NAME = '🏅 MVP';
const MVP_ANNOUNCE_CHANNEL = 'general'; // שנה לפי שם ערוץ ההכרזה

// ⏱️ עדכון פעילות קולית לכל משתמש (יש לקרוא עם ניתוק)
async function updateVoiceActivity(memberId, durationMinutes, db) {
  const userRef = doc(db, 'voiceTime', memberId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, { minutes: durationMinutes });
  } else {
    const data = userSnap.data();
    await updateDoc(userRef, { minutes: (data.minutes || 0) + durationMinutes });
  }
}

// 🏆 חישוב MVP שבועי עם הכרזה ותפקיד
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

  // הסרת MVP קודם
  let mvpRole = guild.roles.cache.find(r => r.name === MVP_ROLE_NAME);
  if (!mvpRole) {
    mvpRole = await guild.roles.create({
      name: MVP_ROLE_NAME,
      color: 'Gold',
      reason: 'תפקיד MVP שבועי',
    });
  }

  const allMembers = await guild.members.fetch();
  allMembers.forEach(m => {
    if (m.roles.cache.has(mvpRole.id)) {
      m.roles.remove(mvpRole);
    }
  });

  // הענקת תפקיד
  await member.roles.add(mvpRole);

  // עדכון זכיות
  const statsRef = doc(db, 'mvpStats', topUser.id);
  const statsSnap = await getDoc(statsRef);
  const wins = statsSnap.exists() ? (statsSnap.data().wins || 0) + 1 : 1;
  await setDoc(statsRef, { wins });

  // הכרזה בערוץ
  const channel = guild.channels.cache.find(c => c.name === MVP_ANNOUNCE_CHANNEL && c.isTextBased());
  if (channel) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 MVP השבועי!')
      .setDescription(`מזל טוב ל־<@${topUser.id}> על **${topUser.minutes} דקות** של נוכחות 🎤!\n\nסה\"כ זכיות: **${wins}**`)
      .setColor('Gold')
      .setTimestamp();

    await channel.send({ content: '@everyone', embeds: [embed] });
  }

  // אפס את הספירה לשבוע הבא
  for (const docSnap of voiceRef.docs) {
    await updateDoc(doc(db, 'voiceTime', docSnap.id), { minutes: 0 });
  }

  // עדכון זמן אחרון שחושב MVP
  await setDoc(doc(db, 'mvpSystem', 'status'), { lastCalculated: Timestamp.now() });
}

// 🕒 בדיקה אם צריך להריץ MVP השבועי (על בסיס Firestore)
async function checkMVPStatusAndRun(client, db) {
  const statusRef = doc(db, 'mvpSystem', 'status');
  const statusSnap = await getDoc(statusRef);

  const now = Timestamp.now();
  let shouldRun = false;

  if (!statusSnap.exists()) {
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

// ייצוא
module.exports = {
  updateVoiceActivity,
  calculateAndAnnounceMVP,
  checkMVPStatusAndRun
};
