const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = '1375415546769838120';
const COVER_PATH = path.join(__dirname, '../assets/schedulecover.png');

const weeklySchedule = [
  { id: 'sunday', day: 'ראשון', emoji: '🔵', desc: 'טורניר פיפו סודי...' },
  { id: 'monday', day: 'שני', emoji: '🟢', desc: 'ערב Resurgence...' },
  { id: 'tuesday', day: 'שלישי', emoji: '🟡', desc: 'GUN GAME לכל הרעבים לדם...' },
  { id: 'wednesday', day: 'רביעי', emoji: '🟣', desc: 'ערב חידות ומשימות...' },
  { id: 'thursday', day: 'חמישי', emoji: '🟠', desc: 'קלאן-וור נדיר! כולם באים...' },
  { id: 'saturday', day: 'שבת', emoji: '🔴', desc: 'מוצ"ש של אש! סשן לילה...' },
];

// הצבעות בזיכרון (לשדרוג – חבר ל-DB)
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
  const dayButtons = weeklySchedule.map(e =>
    new ButtonBuilder()
      .setCustomId(`vote_${e.id}`)
      .setLabel(`${e.day} (${votes[e.id].size})`)
      .setStyle(votes[e.id].has(userId) ? ButtonStyle.Success : ButtonStyle.Primary)
      .setEmoji(e.emoji)
  );

  // פיצול לשתי שורות – 5 ראשונים, שבת + סטטיסטיקה
  return [
    new ActionRowBuilder().addComponents(...dayButtons.slice(0, 5)),
    new ActionRowBuilder().addComponents(
      dayButtons[5],
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

    // 🔒 רק אדמין
    if (!interaction.member?.permissions.has('Administrator')) {
      return await interaction.editReply({
        content: '❌ רק אדמין רשאי להפעיל את הלוח. אם זו טעות – בדוק הרשאות בשרת.',
        ephemeral: true
      });
    }

    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel || !channel.isTextBased()) throw new Error('ערוץ לא תקין!');
      if (!fs.existsSync(COVER_PATH)) throw new Error('קובץ COVER_PATH לא קיים!');

      const buffer = fs.readFileSync(COVER_PATH);
      const coverAttachment = new AttachmentBuilder(buffer, { name: 'schedulecover.png' });

      const embed = new EmbedBuilder()
        .setTitle('📅 לוח פעילות שבועי – GAMERS UNITED IL')
        .setDescription(buildDesc())
        .setImage('attachment://schedulecover.png')
        .setColor('#00B2FF')
        .setFooter({ text: 'LIVE | הצבעה עדכנית • Powered by Shimon Bot' })
        .setTimestamp();

      await channel.send({
        embeds: [embed],
        files: [coverAttachment],
        components: buildButtons(interaction.user.id)
      });

      await interaction.editReply('✅ לוח פעילות שבועי אינטראקטיבי נשלח לערוץ!');
    } catch (err) {
      console.error('❌ שגיאה בלוח פעילות:', err);
      await interaction.editReply(`❌ שגיאה בשליחת הלוח. בדוק הרשאות/לוגים.\n\`\`\`${err}\`\`\``);
    }
  },

  // עבור כפתורי RSVP
  votes, weeklySchedule, buildDesc, buildButtons
};
