// 📁 handlers/dmFallbackModal.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, Collection } = require('discord.js');
const { smartRespond } = require('./smartChat');
const db = require('../utils/firebase');

const BUTTON_ID = 'dm_fallback_reply';
const MODAL_ID = 'dm_fallback_modal';
const INPUT_ID = 'dm_fallback_input';

function createFallbackRow() {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(INPUT_ID)
      .setLabel('מה רצית לומר לשמעון?')
      .setPlaceholder('כתוב כאן את התגובה או השאלה שלך...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
  );
}

function sendFallbackButton(targetUserId) {
  return {
    content: '📬 לא קיבלת DM? אפשר להגיב כאן:',
    components: [
      new ActionRowBuilder().addComponents(
        {
          type: 2,
          style: 1,
          label: '💬 שלח תגובה לשמעון',
          custom_id: BUTTON_ID
        }
      )
    ],
    ephemeral: true
  };
}

// ✅ להצגה ידנית של modal (כשנלחץ כפתור)
async function showDmFallbackModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('📨 תגובה לשמעון')
    .addComponents(createFallbackRow());

  await interaction.showModal(modal);
}

// ✅ לטיפול במידע שנשלח ב־modal
async function handleDmFallbackModalSubmit(interaction, client) {
  const content = interaction.fields.getTextInputValue(INPUT_ID);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  const member = await guild?.members.fetch(interaction.user.id).catch(() => null);

  const fakeMessage = {
    content,
    author: interaction.user,
    guild: null,
    channel: interaction.channel,
    member: member || {
      displayName: interaction.user.username,
      permissions: { has: () => false },
      roles: { cache: new Collection() }
    }
  };

  try {
    await smartRespond(fakeMessage);
    await db.collection('memberTracking').doc(interaction.user.id).set({
      replied: true,
      repliedAt: new Date().toISOString()
    }, { merge: true });

    await interaction.reply({
      content: '✅ שמעון קיבל את ההודעה שלך והגיב בהתאם.',
      ephemeral: true
    });
  } catch (err) {
    console.error('❌ שגיאה בטיפול ב־fallback DM:', err);
    await interaction.reply({
      content: '❌ שגיאה פנימית. נסה שוב מאוחר יותר.',
      ephemeral: true
    });
  }
}

module.exports = {
  sendFallbackButton,
  showDmFallbackModal,
  handleDmFallbackModalSubmit
};
