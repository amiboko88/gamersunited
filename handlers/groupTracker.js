// 📁 handlers/groupTracker.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const statTracker = require('./statTracker');

const activeGroups = new Map();
const pendingLeaves = new Map();
const CHECK_INTERVAL = 10000; // כל 10 שניות
const LEAVE_GRACE_PERIOD = 60000; // זמן חסד של דקה

function startGroupTracking(channel, users, groupName) {
  const key = `${channel.guild.id}-${channel.id}`;
  activeGroups.set(key, { channel, users, groupName, start: Date.now() });
  console.log(`🚀 התחיל מעקב לקבוצה '${groupName}' עם ${users.length} שחקנים.`);
}

setInterval(() => {
  const now = Date.now();

  for (const [key, group] of activeGroups.entries()) {
    const { channel, users, groupName } = group;
    const currentMembers = [...channel.members.keys()].filter(id => !channel.members.get(id).user.bot);

    // מי חסר בערוץ
    const missing = users.filter(uid => !currentMembers.includes(uid));

    // אם אין חסרים – הסר pending
    if (missing.length === 0) {
      pendingLeaves.delete(key);
      continue;
    }

    // אם מישהו עזב – אבל לא חלפה דקה מאז
    const pending = pendingLeaves.get(key) || {};
    const stillPending = missing.filter(uid => {
      const leftAt = pending[uid] || now;
      if (!pending[uid]) pending[uid] = now;
      return now - leftAt >= LEAVE_GRACE_PERIOD;
    });

    // עדכן pending
    pendingLeaves.set(key, pending);

    // אם אף אחד לא "מאושר כעוזב" עדיין
    if (stillPending.length === 0) continue;

    // הקבוצה נחשבת שהתפרקה
    activeGroups.delete(key);
    pendingLeaves.delete(key);

    // תעד בסטטיסטיקה
    stillPending.forEach(uid => statTracker.trackGroupQuit(uid));

    // שלח התראה לערוץ FIFO
    const embed = new EmbedBuilder()
      .setTitle('⚠️ קבוצה התפרקה!')
      .setDescription(`הקבוצה **${groupName}** התפרקה כי ${stillPending.length > 1 ? 'כמה שחקנים' : 'שחקן אחד'} עזב את הערוץ.`)
      .setColor('#ff5555')
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('back_temp').setLabel('חזרתי בטעות').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('kick_confirm').setLabel('העיפו אותנו').setStyle(ButtonStyle.Danger)
    );

    channel.send({ embeds: [embed], components: [buttons] });
    console.log(`❌ הקבוצה '${groupName}' התפרקה.`);
  }
}, CHECK_INTERVAL);

module.exports = { startGroupTracking };
