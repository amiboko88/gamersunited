const { EmbedBuilder } = require('discord.js');
const { votes, weeklySchedule, buildDesc, buildButtons, getTopVoters } = require('../commands/activityBoard');
const db = require('../utils/firebase');

const CHANNEL_ID = '1375415546769838120';

module.exports = async function handleRSVP(interaction, client) {
  const userId = interaction.user.id;

  if (interaction.customId.startsWith('vote_')) {
    const id = interaction.customId.replace('vote_', '');
    const alreadyVoted = votes[id].has(userId);

    if (alreadyVoted) {
      votes[id].delete(userId);
    } else {
      votes[id].add(userId);
    }

    // עדכון Embed (כמו בקומנד Slash)
    const channel = await client.channels.fetch(CHANNEL_ID);
    const boardDoc = db.collection('systemTasks').doc('activityBoardMessage');
    let msgId = null;
    const snap = await boardDoc.get();
    if (snap.exists) msgId = snap.data().id;

    let boardMsg = null;
    if (msgId) {
      try {
        boardMsg = await channel.messages.fetch(msgId);
      } catch (e) { }
    }

    if (boardMsg) {
      const topVoters = getTopVoters();
      const embed = EmbedBuilder.from(boardMsg.embeds[0])
        .setDescription(buildDesc(topVoters))
        .setTimestamp(new Date());
      await boardMsg.edit({
        embeds: [embed],
        components: buildButtons(userId)
      });
    }

    // תגובה קצרה ואישית
    await interaction.reply({
      content: alreadyVoted ?
        `❌ ההצבעה שלך ליום **${weeklySchedule.find(e => e.id === id).day}** הוסרה.` :
        `✅ נספרת ל**${weeklySchedule.find(e => e.id === id).day}**! מחכים לראות אותך. ${weeklySchedule.find(e => e.id === id).emoji}`,
      ephemeral: true
    });

  } else if (interaction.customId === 'show_stats') {
    // שלח Embed סטטיסטיקה בלייב
    const stats = weeklySchedule.map(e =>
      `**${e.day}**: ${votes[e.id].size} הצבעות`
    ).join('\n');
    const embed = new EmbedBuilder()
      .setTitle('📊 סטטיסטיקת הצבעות')
      .setDescription(stats)
      .setColor('#00B2FF')
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
