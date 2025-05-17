const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const medals = ['🥇', '🥈', '🥉', '🎖️', '🎖️'];

function registerMvpCommand(commands) {
  commands.push(
    new SlashCommandBuilder()
      .setName('mvp')
      .setDescription('📊 צפייה בלוח השבועי')
      .toJSON()
  );
}

async function execute(interaction, client) {
  await interaction.deferReply({ flags: 64 });

  const db = client.db;
  const userName = interaction.user.displayName || interaction.user.username;

  const [voiceRef, statsRef, lifeRef] = await Promise.all([
    db.collection('voiceTime').get(),
    db.collection('mvpStats').get(),
    db.collection('voiceLifetime').get()
  ]);

  const current = [];
  const stats = [];
  const lifetime = [];

  voiceRef.forEach(doc => {
    const d = doc.data();
    current.push({ id: doc.id, minutes: d.minutes || 0 });
  });

  statsRef.forEach(doc => {
    const d = doc.data();
    stats.push({ id: doc.id, wins: d.wins || 0 });
  });

  lifeRef.forEach(doc => {
    const d = doc.data();
    lifetime.push({ id: doc.id, total: d.total || 0 });
  });

  current.sort((a, b) => b.minutes - a.minutes);
  stats.sort((a, b) => b.wins - a.wins);
  lifetime.sort((a, b) => b.total - a.total);

  const formatList = (arr, key, emojiSet, label) =>
    arr.slice(0, 5).map((u, i) =>
      `${emojiSet[i] || '▫️'} <@${u.id}> – **${u[key]} ${label}**`
    ).join('\n') || 'אין נתונים זמינים.';

  const embed = new EmbedBuilder()
    .setColor('#facc15')
    .setTitle('👑 מצטייני השבוע')
.addFields(
  {
    name: '🏅 חמשת הפעילים ביותר השבוע:',
    value: formatList(current, 'minutes', medals, 'דקות'),
    inline: false
  },
  {
    name: '🥇 מספר זכיות מצטברות:',
    value: formatList(stats, 'wins', medals, 'זכיות'),
    inline: false
  },
  {
    name: '⏱️ סך כל דקות הנוכחות הכולל:',
    value: formatList(lifetime, 'total', medals, 'דקות'),
    inline: false
  }
)

    .setFooter({
      text: `🧠 ${userName} | 🗓️ ${new Date().toLocaleDateString('he-IL')}`,
      iconURL: interaction.user.displayAvatarURL()
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

module.exports = {
  registerMvpCommand,
  execute
};