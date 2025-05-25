// 📁 handlers/memberTracker.js
const cron = require('node-cron');
const db = require('../utils/firebase');
const statTracker = require('./statTracker');
const { smartRespond } = require('./smartChat');

const STAFF_CHANNEL_ID = '881445829100060723';
const GUILD_ID = process.env.GUILD_ID;
const INACTIVITY_DAYS = 30;

function setupMemberTracker(client) {
  // כל משתמש חדש – נשמר למסד הנתונים
  client.on('guildMemberAdd', async member => {
    if (member.user.bot) return;
    const joinedAt = new Date().toISOString();
    await db.collection('memberTracking').doc(member.id).set({ joinedAt });
    console.log(`👤 נוסף משתמש חדש: ${member.displayName}`);
  });

  // רושם פעילות קולית לכל משתמש שמתחבר
  client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member;
    if (member?.user?.bot) return;
    if (!newState.channelId) return;
    db.collection('voiceActivity').doc(member.id).set({ lastSeen: new Date().toISOString() });
  });

  // זיהוי תגובות ל-DM
  client.on('messageCreate', async message => {
    if (!message.guild && !message.author.bot) {
      const userId = message.author.id;
      const dmTrackRef = db.collection('memberDMs').doc(userId);
      const dmTrack = await dmTrackRef.get();

      if (dmTrack.exists && !dmTrack.data().replied) {
        await dmTrackRef.set({
          replied: true,
          replyAt: new Date().toISOString(),
          replyText: message.content
        }, { merge: true });

        const staff = await client.channels.fetch(STAFF_CHANNEL_ID);
        if (staff && staff.isTextBased()) {
          await staff.send(`📨 המשתמש <@${userId}> הגיב להודעת ה-DM:
"${message.content}"`);
        }

        const autoResponse = await smartRespond(message, 'מפרגן');
        await message.channel.send(autoResponse);
      }
    }
  });

  // סריקה יומית לאיתור משתמשים לא פעילים
  cron.schedule('0 3 * * *', async () => {
    console.log('📋 סריקת משתמשים לא פעילים...');
    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    const now = Date.now();
    const allTracked = await db.collection('memberTracking').get();
    const alreadyMessaged = (await db.collection('memberDMs').get()).docs.map(d => d.id);
    const allStats = await db.collection('activityStats').get();

    for (const doc of allTracked.docs) {
      const userId = doc.id;
      if (alreadyMessaged.includes(userId)) continue;

      const joined = new Date(doc.data().joinedAt);
      const daysSinceJoin = (now - joined.getTime()) / 86400000;
      if (daysSinceJoin < INACTIVITY_DAYS) continue;

      const voiceDoc = await db.collection('voiceActivity').doc(userId).get();
      const lastVoice = voiceDoc.exists ? new Date(voiceDoc.data().lastSeen) : null;
      const daysSinceVoice = lastVoice ? (now - lastVoice.getTime()) / 86400000 : Infinity;

      const userStats = allStats.docs.find(d => d.id === userId)?.data() || {};
      const totalMessages = userStats.messagesSent || 0;
      const totalSlash = userStats.slashUsed || 0;

      const isActive = daysSinceVoice < INACTIVITY_DAYS || totalMessages > 0 || totalSlash > 0;
      if (isActive) continue;

      // שליחת DM עם GPT
      const user = await client.users.fetch(userId);
      try {
        const prompt = `אתה שמעון, בוט גיימרים ישראלי. כתוב הודעה משעשעת בעברית עבור משתמש שנמצא בקהילה אבל לא היה פעיל חודש. תשאל אותו אם הוא עדיין מעוניין להיות חלק מהקהילה.`;
        const message = await smartRespond({ content: '', author: user }, 'שובב', prompt);
        await user.send(message);
        console.log(`📨 נשלחה הודעת DM למשתמש ${user.username}`);
      } catch (err) {
        console.warn(`⚠️ שגיאה בשליחת DM ל־${userId}:`, err.message);
      }

      // שלח לוג ל־STAFF
      const staff = await client.channels.fetch(STAFF_CHANNEL_ID);
      if (staff && staff.isTextBased()) {
        await staff.send(`🚨 משתמש <@${userId}> לא פעיל מעל חודש. נשלחה לו הודעה לבדוק אם הוא עדיין איתנו.`);
      }

      // תעד ב־DB
      await db.collection('memberDMs').doc(userId).set({ sentAt: new Date().toISOString(), replied: false });
      await statTracker.trackInactivity(userId);
    }
  });
}

module.exports = { setupMemberTracker };
