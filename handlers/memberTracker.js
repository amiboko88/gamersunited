const { Events, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { db } = require('../utils/firebase');
const { logToWebhook } = require('../utils/logger');

const CHECK_INTERVAL = 1000 * 60 * 60 * 6; // כל 6 שעות
const ONE_MONTH = 1000 * 60 * 60 * 24 * 30;

function setupMemberTracker(client) {
  client.on(Events.GuildMemberAdd, async member => {
    if (member.user.bot) return;
    const ref = db.doc(`users/${member.id}`);
    await ref.set({ joinedAt: Date.now(), lastActivity: null, pendingReminder: false });
  });

  client.on(Events.MessageCreate, async message => {
    if (message.channel.type !== 'DM' || message.author.bot) return;

    const ref = db.doc(`users/${message.author.id}`);
    const doc = await ref.get();
    if (!doc.exists) return;

    await ref.update({ lastActivity: Date.now(), pendingReminder: false });

    await logToWebhook({
      title: '✉️ תגובה טקסטואלית מ־DM',
      description: `המשתמש <@${message.author.id}> הגיב:\n"${message.content}"`,
      color: 0x00bcd4
    });
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'still_here') return;

    const ref = db.doc(`users/${interaction.user.id}`);
    await ref.update({ lastActivity: Date.now(), pendingReminder: false });

    await interaction.reply({ content: 'תודה, עודכנת כפעיל 👍', ephemeral: true });

    await logToWebhook({
      title: '✅ המשתמש לחץ על הכפתור',
      description: `<@${interaction.user.id}> אישר שהוא עדיין כאן באמצעות כפתור.`,
      color: 0x4caf50
    });
  });

  setInterval(async () => {
    const now = Date.now();
    const usersSnap = await db.collection('users').get();

    for (const doc of usersSnap.docs) {
      const { joinedAt, lastActivity, pendingReminder } = doc.data();
      if (!joinedAt || lastActivity || pendingReminder) continue;
      if (now - joinedAt < ONE_MONTH) continue;

      const user = await client.users.fetch(doc.id).catch(() => null);
      if (!user) continue;

      const embed = new EmbedBuilder()
        .setColor(0xffc107)
        .setTitle('👀 לא זוהתה פעילות')
        .setDescription(
          "היי 👋\nהצטרפת אלינו לפני כחודש, אך לא זיהינו ממך פעילות כלשהי (לא בצ'אט ולא בערוץ קול).\nאם אתה עדיין מעוניין להישאר, לחץ על הכפתור או השב להודעה."
        )
        .setFooter({ text: 'FIFO BOT | סינון משתמשים לא פעילים' });

      const button = new ButtonBuilder()
        .setCustomId('still_here')
        .setLabel('אני עדיין כאן 👋')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(button);

      await user.send({ embeds: [embed], components: [row] }).catch(() => {});
      await db.doc(`users/${doc.id}`).update({ pendingReminder: true });

      await logToWebhook({
        title: '📌 משתמש חדש ללא פעילות',
        description: `<@${doc.id}> הצטרף בתאריך ${new Date(joinedAt).toLocaleDateString('he-IL')}`,
        color: 0xff9800
      });
    }
  }, CHECK_INTERVAL);
}

module.exports = { setupMemberTracker };
