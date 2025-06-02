const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1375415546769838120';
const COVER_PATH = path.join(__dirname, '../assets/schedulecover.png');
const ROLE_ID = '1133753472966201555'; // עדכן ל-ID של Role לבאדג'

const weeklySchedule = [
  { id: 'sunday', day: 'ראשון', emoji: '🔵', desc: 'טורניר פיפו סודי...' },
  { id: 'monday', day: 'שני', emoji: '🟢', desc: 'ערב Resurgence...' },
  { id: 'tuesday', day: 'שלישי', emoji: '🟡', desc: 'GUN GAME לכל הרעבים לדם...' },
  { id: 'wednesday', day: 'רביעי', emoji: '🟣', desc: 'ערב חידות ומשימות...' },
  { id: 'thursday', day: 'חמישי', emoji: '🟠', desc: 'קלאן-וור נדיר! כולם באים...' },
  { id: 'saturday', day: 'שבת', emoji: '🔴', desc: 'מוצ"ש של אש! סשן לילה...' },
];

// כל ההצבעות — בזיכרון (להדגמה, תוכל להעביר ל-Firestore)
const votes = {
  sunday: new Set(), monday: new Set(), tuesday: new Set(),
  wednesday: new Set(), thursday: new Set(), saturday: new Set()
};

function buildDesc() {
  return weeklySchedule.map(e =>
    `**${e.day}** ┃ ${e.desc}\n${e.emoji}  \`${votes[e.id].size} הצבעות\``
  ).join('\n──────────────\n');
}

function buildButtons(userId) {
  return [
    new ActionRowBuilder().addComponents(
      ...weeklySchedule.map(e =>
        new ButtonBuilder()
          .setCustomId(`vote_${e.id}`)
          .setLabel(`${e.day} (${votes[e.id].size})`)
          .setStyle(votes[e.id].has(userId) ? ButtonStyle.Success : ButtonStyle.Primary)
          .setEmoji(e.emoji)
      ),
      new ButtonBuilder()
        .setCustomId('show_stats')
        .setLabel('📊 הצג סטטיסטיקה')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('שלח או עדכן את לוח הפעילות השבועי (אינטראקטיבי, עם הצבעות LIVE!)'),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel || !channel.isTextBased()) throw 'ערוץ לא תקין!';
      const buffer = fs.readFileSync(COVER_PATH);
      const coverAttachment = new AttachmentBuilder(buffer, { name: 'schedulecover.png' });

      const embed = new EmbedBuilder()
        .setTitle('📅 לוח פעילות שבועי – GAMERS UNITED IL')
        .setDescription(buildDesc())
        .setImage('attachment://schedulecover.png')
        .setColor('#00B2FF')
        .setFooter({ text: 'LIVE | הצבעה עדכנית • Powered by Shimon Bot' })
        .setTimestamp();

      // שלח את הלוח — ושמור את ה-ID להמשך עריכה!
      const sentMsg = await channel.send({
        embeds: [embed],
        files: [coverAttachment],
        components: buildButtons()
      });

      // שמור ID ב-Firestore אם תרצה עריכה/סטטיסטיקה בהמשך
      await interaction.editReply('✅ לוח פעילות שבועי אינטראקטיבי נשלח לערוץ!');
    } catch (err) {
      console.error('שגיאה בלוח פעילות:', err);
      await interaction.editReply('❌ שגיאה בשליחת הלוח. בדוק הרשאות/לוגים.');
    }
  },

  // ייצוא עבור האנדלר (להתחבר ל-handler אם צריך)
  votes, weeklySchedule, buildDesc, buildButtons, ROLE_ID
};
