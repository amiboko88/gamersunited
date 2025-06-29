const { AttachmentBuilder } = require('discord.js');
const db = require('../utils/firebase');
const { renderLeaderboardImage } = require('./leaderboardRenderer');
const { sendLeaderboardToTelegram } = require('./sendLeaderboardToTelegram');
const path = require('path');

const CHANNEL_ID = '1375415570937151519';

function calculateScore(data) {
  return (
    (data.voiceMinutes || 0) * 1 +
    (data.messagesSent || 0) * 2 +
    (data.slashUsed || 0) * 3 +
    (data.soundsUsed || 0) * 2 +
    (data.smartReplies || 0) * 1 +
    (data.rsvpCount || 0) * 2 +
    (data.mvpWins || 0) * 5 +
    (data.joinStreak || 0) * 3
  );
}

async function fetchTopUsers(limit = 5) {
  const snapshot = await db.collection('userStats').get();
  const users = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const score = calculateScore(data);

    if (score > 0) {
      users.push({
        userId: doc.id,
        score,
        voiceMinutes: data.voiceMinutes || 0,
        messagesSent: data.messagesSent || 0,
        slashUsed: data.slashUsed || 0,
        soundsUsed: data.soundsUsed || 0,
        smartReplies: data.smartReplies || 0,
        rsvpCount: data.rsvpCount || 0,
        mvpWins: data.mvpWins || 0,
        joinStreak: data.joinStreak || 0
      });
    }
  });

  return users.sort((a, b) => b.score - a.score).slice(0, limit);
}
async function sendLeaderboardEmbed(client) {
  try {
    const topUsers = await fetchTopUsers();
    if (!topUsers.length) {
      console.log('ℹ️ אין משתמשים פעילים ל־Leaderboard.');
      return false;
    }

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const members = await guild.members.fetch();

    const enrichedUsers = topUsers.map(user => {
      const member = members.get(user.userId);
      return {
        name: member?.displayName || 'Unknown',
        avatarURL: member?.displayAvatarURL({ extension: 'png', size: 128 }) || '',
        score: user.score,
        mvpWins: user.mvpWins || 0,
        joinStreak: user.joinStreak || 0
      };
    });

    const imagePath = await renderLeaderboardImage(enrichedUsers);
    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error('❌ לא נמצא ערוץ עם ID:', CHANNEL_ID);
      return false;
    }

    const introImagePath = path.join(__dirname, '../assets/leaderboard_intro.png');
    const recentMessages = await channel.messages.fetch({ limit: 10 });

    const introExists = recentMessages.some(msg =>
      msg.attachments.some(att => att.name === 'leaderboard_intro.png')
    );

    if (!introExists) {
      console.log('🧹 לא נמצאה תמונת פתיחה – מוחק הודעות קיימות...');
      for (const msg of recentMessages.values()) {
        try {
          await msg.delete();
        } catch (err) {
          console.warn(`⚠️ לא ניתן למחוק הודעה ${msg.id}:`, err.message);
        }
      }

      const postDeletionMessages = await channel.messages.fetch({ limit: 5 });
      const stillHasIntro = postDeletionMessages.some(msg =>
        msg.attachments.some(att => att.name === 'leaderboard_intro.png')
      );

      if (stillHasIntro) {
        console.warn('🚨 תמונת פתיחה עדיין קיימת לאחר ניסיון מחיקה – מבטל שליחה כפולה.');
        return false;
      }

      const introImage = new AttachmentBuilder(introImagePath);
      await channel.send({ files: [introImage], allowedMentions: { parse: [] } });
      console.log('🖼️ תמונת הפתיחה נשלחה מחדש.');
    } else {
      console.log('⏩ זוהתה תמונת פתיחה קיימת – ממשיך לעדכון נתונים בלבד.');
    }

    await sendLeaderboardToTelegram(imagePath, '🏆 מצטייני השבוע – GAMERS UNITED IL');
    const leaderboardImage = new AttachmentBuilder(imagePath);

    const docRef = db.collection('systemTasks').doc('weeklyLeaderboard');
    const doc = await docRef.get();
    let message;

    if (doc.exists && doc.data().messageId) {
      const prevMessageId = doc.data().messageId;
      const prevMessage = await channel.messages.fetch(prevMessageId).catch(() => null);

      if (prevMessage) {
        message = await prevMessage.edit({
          content: '🏆 **מצטייני השבוע – GAMERS UNITED IL**\n(התמונה מוצגת במלואה 👇)',
          files: [leaderboardImage],
          allowedMentions: { parse: [] }
        });
        console.log('📝 לוח הפעילות עודכן על הודעה קיימת.');
      }
    }

    if (!message) {
      message = await channel.send({
        content: '🏆 **מצטייני השבוע – GAMERS UNITED IL**\n(התמונה מוצגת במלואה 👇)',
        files: [leaderboardImage],
        allowedMentions: { parse: [] }
      });

      await docRef.set({ messageId: message.id, lastUpdated: new Date().toISOString() }, { merge: true });
      console.log('✅ לוח הפעילות נשלח כהודעה חדשה.');
    }

    await db.collection("leaderboard").doc("mvp").set({
      url: message.attachments.first()?.url || "",
      updatedAt: new Date().toISOString()
    });

    await message.react('🏅');
    return true;

  } catch (error) {
    console.error('❌ שגיאה בשליחת Leaderboard:', error);
    return false;
  }
}

module.exports = { sendLeaderboardEmbed };
