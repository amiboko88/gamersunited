// 📁 handlers/groupTracker.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const statTracker = require('./statTracker');

const activeGroups = new Map();
const pendingLeaves = new Map();
const LEAVE_GRACE_PERIOD = 60000; // זמן חסד של דקה

/**
 * מתחיל מעקב אחר קבוצה חדשה.
 * @param {import('discord.js').VoiceChannel} channel - הערוץ הקולי של הקבוצה.
 * @param {string[]} users - מערך של ID המשתמשים בקבוצה.
 * @param {string} groupName - שם הקבוצה.
 */
function startGroupTracking(channel, users, groupName) {
  const key = `${channel.guild.id}-${channel.id}`;
  activeGroups.set(key, { channel, users, groupName, start: Date.now() });
  console.log(`🚀 התחיל מעקב לקבוצה '${groupName}' עם ${users.length} שחקנים.`);
}

/**
 * מבצע סריקה אחת על כל הקבוצות הפעילות ובודק אם התפרקו.
 * פונקציה זו נקראת על ידי מתזמן מרכזי (cron).
 * @param {import('discord.js').Client} client - אובייקט הקליינט של דיסקורד.
 */
async function checkActiveGroups(client) {
  const now = Date.now();

  for (const [key, group] of activeGroups.entries()) {
    const { channel, users, groupName } = group;

    // ודא שהערוץ עדיין קיים
    if (!channel.guild.channels.cache.has(channel.id)) {
        activeGroups.delete(key);
        pendingLeaves.delete(key);
        console.log(`🧹 ערוץ של קבוצה '${groupName}' נמחק, המעקב הופסק.`);
        continue;
    }

    const currentMembers = [...channel.members.keys()].filter(id => !channel.members.get(id).user.bot);

    // מי חסר בערוץ
    const missing = users.filter(uid => !currentMembers.includes(uid));

    // אם אין חסרים – הסר את המעקב הזמני אחר העוזבים
    if (missing.length === 0) {
      pendingLeaves.delete(key);
      continue;
    }

    // אם מישהו עזב – בדוק אם עבר זמן החסד
    const pending = pendingLeaves.get(key) || {};
    const confirmedLeavers = [];

    for (const uid of missing) {
        if (!pending[uid]) {
            pending[uid] = now; // התחל לספור זמן חסד
        }
        if (now - pending[uid] >= LEAVE_GRACE_PERIOD) {
            confirmedLeavers.push(uid); // זמן החסד עבר
        }
    }

    // עדכן את רשימת הממתינים
    pendingLeaves.set(key, pending);

    // אם אף אחד לא "מאושר כעוזב" עדיין
    if (confirmedLeavers.length === 0) continue;

    // הקבוצה נחשבת שהתפרקה
    activeGroups.delete(key);
    pendingLeaves.delete(key);

    // תעד בסטטיסטיקה
    confirmedLeavers.forEach(uid => statTracker.trackGroupQuit(uid));

    // שלח התראה לערוץ FIFO
    const embed = new EmbedBuilder()
      .setTitle('⚠️ קבוצה התפרקה!')
      .setDescription(`הקבוצה **${groupName}** התפרקה כי ${confirmedLeavers.length > 1 ? 'כמה שחקנים' : 'שחקן אחד'} עזב את הערוץ.`)
      .setColor('#ff5555')
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('back_temp').setLabel('חזרתי בטעות').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('kick_confirm').setLabel('העיפו אותנו').setStyle(ButtonStyle.Danger)
    );

    try {
        await channel.send({ embeds: [embed], components: [buttons] });
        console.log(`❌ הקבוצה '${groupName}' התפרקה.`);
    } catch(error) {
        console.error(`❌ שגיאה בשליחת הודעת פירוק קבוצה ל-${channel.name}:`, error);
    }
  }
}

module.exports = { startGroupTracking, checkActiveGroups };