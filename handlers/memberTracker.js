// 📁 handlers/memberTracker.js
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/firebase');

const STAFF_CHANNEL_ID = '881445829100060723';
const TRACKING_COLLECTION = 'memberTracking';
const VOICE_ACTIVITY_COLLECTION = 'voiceActivity';
const DM_STATUS_COLLECTION = 'memberDMs';

const NEW_USER_DAYS = 30;   // כמה ימים מאז הכניסה נחשב חדש
const CHECK_INTERVAL_MIN = 60; // כל כמה דקות תרוץ בדיקה
const NO_ACTIVITY_DAYS = 30; // כמה זמן ללא פעילות יחשב "מת"

function nowIso() {
  return new Date().toISOString();
}

// עוזר – קבל רשימת משתמשים חדשים מהשרת שלא ב־tracking
async function fetchNewMembersToTrack(guild) {
  const tracked = await db.collection(TRACKING_COLLECTION).get();
  const trackedIds = new Set(tracked.docs.map(doc => doc.id));

  const joinedThreshold = Date.now() - NEW_USER_DAYS * 24 * 60 * 60 * 1000;
  const candidates = [];

  await guild.members.fetch(); // ודא שכל החברים זמינים בזיכרון

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    if (trackedIds.has(member.id)) continue;
    if (member.joinedTimestamp && member.joinedTimestamp >= joinedThreshold) {
      candidates.push(member);
    }
  }
  return candidates;
}

// מאזין קבוע לחיבור לערוץ קול – רושם "פעילות" למשתמש
async function logVoiceActivity(userId, guildId) {
  await db.collection(VOICE_ACTIVITY_COLLECTION).doc(`${guildId}_${userId}`).set({
    userId,
    guildId,
    lastSeen: nowIso(),
    lastMonthSeen: Date.now()
  }, { merge: true });
}

// בעת עליית הבוט – ודא שכל משתמש שנכנס ב־30 יום האחרונים מתועד ב־tracking
async function syncAllRecentMembers(guild) {
  const toTrack = await fetchNewMembersToTrack(guild);
  for (const member of toTrack) {
    await db.collection(TRACKING_COLLECTION).doc(member.id).set({
      joinedAt: member.joinedAt?.toISOString?.() || nowIso(),
      guildId: guild.id,
      status: 'active'
    }, { merge: true });
  }
}

// הפעלה מתוזמנת – כל X דקות: סרוק מי צריך לקבל DM/בדיקה
async function scheduledCheck(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    await syncAllRecentMembers(guild);

    const trackingSnap = await db.collection(TRACKING_COLLECTION).get();

    for (const doc of trackingSnap.docs) {
      const data = doc.data();
      const userId = doc.id;
      const member = guild.members.cache.get(userId);

      if (!member) continue;

      // נבדוק אם עברה תקופה בלי פעילות (ערוץ קול)
      const voiceDoc = await db.collection(VOICE_ACTIVITY_COLLECTION).doc(`${guildId}_${userId}`).get();
      let lastVoiceTs = voiceDoc.exists && voiceDoc.data().lastMonthSeen
        ? voiceDoc.data().lastMonthSeen
        : new Date(data.joinedAt).getTime();

      const daysSinceLastActivity = (Date.now() - lastVoiceTs) / (1000 * 60 * 60 * 24);

      // לא שלחנו DM למשתמש הזה לאחרונה?
      const dmStatus = await db.collection(DM_STATUS_COLLECTION).doc(`${guildId}_${userId}`).get();
      if (daysSinceLastActivity >= NO_ACTIVITY_DAYS && (!dmStatus.exists || !dmStatus.data().sentAt || Date.now() - new Date(dmStatus.data().sentAt).getTime() > NO_ACTIVITY_DAYS * 24 * 60 * 60 * 1000)) {
        try {
          // שלח DM
          const user = await client.users.fetch(userId);
          const dm = await user.send("היי 👋 שמנו לב שלא היית פעיל/ה לאחרונה בשרת. אם את/ה עדיין מעוניין להישאר, אשמח שתשלח לי הודעה כאן (אפילו סתם אימוג'י)! אחרת ננקה משתמשים לא פעילים בקרוב. תודה!");

          // לוג
          await logDMToStaff(userId, guild, dm.url);

          // עדכן שליחה במסד
          await db.collection(DM_STATUS_COLLECTION).doc(`${guildId}_${userId}`).set({
            sentAt: nowIso(),
            status: 'pending'
          });

          // מאזין לתגובה
          const collector = dm.channel.createMessageCollector({ filter: m => !m.author.bot, time: 1000 * 60 * 60 * 24, max: 1 });
          collector.on('collect', async reply => {
            await db.collection(DM_STATUS_COLLECTION).doc(`${guildId}_${userId}`).set({
              sentAt: nowIso(),
              status: 'replied',
              reply: reply.content
            }, { merge: true });
            await logDMReplyToStaff(userId, guild, reply.content);
          });
          collector.on('end', async collected => {
            if (collected.size === 0) {
              await db.collection(DM_STATUS_COLLECTION).doc(`${guildId}_${userId}`).set({
                sentAt: nowIso(),
                status: 'ignored'
              }, { merge: true });
              await logDMNoReplyToStaff(userId, guild);
            }
          });
        } catch (err) {
          // לא הצלחנו לשלוח DM
        }
      }
    }
  }
}

async function logDMToStaff(userId, guild, url) {
  const staffChannel = guild.channels.cache.get(STAFF_CHANNEL_ID);
  if (!staffChannel?.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor('Blue')
    .setTitle('📩 נשלחה בקשת אישור משתמש לא פעיל')
    .setDescription(`<@${userId}> קיבל DM לבדוק אם הוא מעוניין להישאר.\n[מעבר ל־DM](${url})`)
    .setTimestamp();
  staffChannel.send({ embeds: [embed] }).catch(() => {});
}

async function logDMReplyToStaff(userId, guild, reply) {
  const staffChannel = guild.channels.cache.get(STAFF_CHANNEL_ID);
  if (!staffChannel?.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor('Green')
    .setTitle('✅ תגובה לאישור משתמש')
    .setDescription(`<@${userId}> הגיב:\n${reply}`)
    .setTimestamp();
  staffChannel.send({ embeds: [embed] }).catch(() => {});
}

async function logDMNoReplyToStaff(userId, guild) {
  const staffChannel = guild.channels.cache.get(STAFF_CHANNEL_ID);
  if (!staffChannel?.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor('Red')
    .setTitle('⏱️ לא התקבלה תגובה ממשתמש')
    .setDescription(`<@${userId}> לא ענה לבוט במשך 24 שעות לאחר בקשת אישור.`)
    .setTimestamp();
  staffChannel.send({ embeds: [embed] }).catch(() => {});
}

// מאזין אוטומטי לחיבור לערוץ קול
function setupMemberTracker(client) {
  client.on('voiceStateUpdate', (oldState, newState) => {
    const user = newState.member?.user;
    if (!user || user.bot) return;
    if (newState.channelId && (!oldState.channelId || newState.channelId !== oldState.channelId)) {
      logVoiceActivity(user.id, newState.guild.id);
    }
  });

  // ריצה אוטומטית כל שעה
  setInterval(() => scheduledCheck(client), CHECK_INTERVAL_MIN * 60 * 1000);
}

module.exports = { setupMemberTracker };
