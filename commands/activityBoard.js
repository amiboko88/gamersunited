const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('../utils/firebase'); // אם אין לך — תוכל להחליף בקובץ JSON

const CHANNEL_ID = '1375415546769838120';
const COVER_PATH = path.join(__dirname, '../assets/schedulecover.png');

// שמות ימי השבוע (עברית, RTL)
const weeklySchedule = [
  { id: 'sunday', day: 'ראשון', color: ButtonStyle.Primary, emoji: '🔵', desc: 'טורניר פיפו סודי — מי בא לנצח?!' },
  { id: 'monday', day: 'שני', color: ButtonStyle.Success, emoji: '🟢', desc: 'Resurgence עם הקבועים — צחוקים, קרינג׳, וצרחות' },
  { id: 'tuesday', day: 'שלישי', color: ButtonStyle.Secondary, emoji: '🟡', desc: 'GUN GAME לכל הרעבים לדם (ואל תשכחו אוזניות)' },
  { id: 'wednesday', day: 'רביעי', color: ButtonStyle.Danger, emoji: '🟣', desc: 'ערב BR ומשימות משוגעות — פרסים למנצחים' },
  { id: 'thursday', day: 'חמישי', color: ButtonStyle.Primary, emoji: '🟠', desc: 'קלאן-וור נדיר! כולם באים — בלי תירוצים!' },
  { id: 'saturday', day: 'שבת', color: ButtonStyle.Success, emoji: '🔴', desc: 'מוצ״ש של אש! סשן לילה עד שהאצבעות נמסות' }
];

// מערכת הצבעות בזיכרון — להחלפה ב־DB/Firestore במידת הצורך
const votes = {
  sunday: new Set(), monday: new Set(), tuesday: new Set(),
  wednesday: new Set(), thursday: new Set(), saturday: new Set()
};

function buildDesc(topVoters=[]) {
  return weeklySchedule.map(e => {
    let badge = '';
    if (topVoters.includes(e.id)) badge = ' 🏆';
    return `━━━━━━━━━━━━━━━━
**${e.day}** | ${e.desc}${badge}
הצבעות: \`${votes[e.id].size}\` ${e.emoji}`;
  }).join('\n');
}

// בניית כפתורים — צבע לכל יום, שבת + כפתור סטטיסטיקה בשורה שנייה
function buildButtons(userId) {
  const dayButtons = weeklySchedule.map(e =>
    new ButtonBuilder()
      .setCustomId(`vote_${e.id}`)
      .setLabel(`${e.day} (${votes[e.id].size})`)
      .setStyle(e.color)
      .setEmoji(e.emoji)
  );
  return [
    new ActionRowBuilder().addComponents(...dayButtons.slice(0, 5)),
    new ActionRowBuilder().addComponents(
      dayButtons[5],
      new ButtonBuilder()
        .setCustomId('show_stats')
        .setLabel('הצג סטטיסטיקה')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊')
    )
  ];
}

// קבלת TOP ימים (ל־Badge)
function getTopVoters() {
  const arr = weeklySchedule.map(e => ({ id: e.id, count: votes[e.id].size }));
  const max = Math.max(...arr.map(x=>x.count));
  if (max === 0) return [];
  return arr.filter(x=>x.count === max).map(x=>x.id);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('שלח או עדכן את לוח הפעילות השבועי (אינטראקטיבי, עם הצבעות LIVE!)'),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    // הגבלת אדמין בלבד
    if (!interaction.member?.permissions.has('Administrator')) {
      return await interaction.editReply({
        content: '❌ רק אדמין רשאי להפעיל את הלוח. בדוק הרשאות בשרת.',
        ephemeral: true
      });
    }

    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel || !channel.isTextBased()) throw new Error('ערוץ לא תקין!');
      if (!fs.existsSync(COVER_PATH)) throw new Error('קובץ COVER_PATH לא קיים!');

      // --- בדיקה אם יש כבר הודעה קיימת לשדרוג (ולא לשלוח חדשה כל פעם) ---
      const boardDoc = db.collection('systemTasks').doc('activityBoardMessage');
      let msgId = null;
      const snap = await boardDoc.get();
      if (snap.exists) msgId = snap.data().id;

      let boardMsg = null;
      if (msgId) {
        try {
          boardMsg = await channel.messages.fetch(msgId);
        } catch (e) { /* נמחקה? תיצור חדשה */ }
      }

      const buffer = fs.readFileSync(COVER_PATH);
      const coverAttachment = new AttachmentBuilder(buffer, { name: 'schedulecover.png' });

      // חישוב TOP יום/ימים
      const topVoters = getTopVoters();

      const embed = new EmbedBuilder()
        .setTitle('📅 לוח פעילויות שבועי – GAMERS UNITED IL')
        .setDescription(buildDesc(topVoters))
        .setImage('attachment://schedulecover.png')
        .setColor('#00B2FF')
        .setFooter({ text: 'LIVE | Powered by Shimon Bot' })
        .setTimestamp();

      if (boardMsg) {
        await boardMsg.edit({
          embeds: [embed],
          files: [coverAttachment],
          components: buildButtons(interaction.user.id)
        });
        await interaction.editReply('✅ לוח פעילות עודכן בהצלחה!');
      } else {
        const sentMsg = await channel.send({
          embeds: [embed],
          files: [coverAttachment],
          components: buildButtons(interaction.user.id)
        });
        await boardDoc.set({ id: sentMsg.id });
        await interaction.editReply('✅ לוח פעילות שבועי נשלח לערוץ!');
      }
    } catch (err) {
      console.error('❌ שגיאה בלוח פעילות:', err);
      await interaction.editReply(`❌ שגיאה בשליחת הלוח. בדוק הרשאות/לוגים.\n\`\`\`${err}\`\`\``);
    }
  },

  votes, weeklySchedule, buildDesc, buildButtons, getTopVoters
};
