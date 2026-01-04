// 📁 handlers/dmFallbackModal.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, Collection, MessageFlags } = require('discord.js');
const { smartRespond } = require('./smartChat');
const { getUserRef } = require('../utils/userUtils'); // ✅ DB מאוחד
const admin = require('firebase-admin');

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

function sendFallbackButton() {
  return {
    content: '📬 לא קיבלת DM? אפשר להגיב כאן:',
    components: [
      new ActionRowBuilder().addComponents({
        type: 2, style: 1, label: '💬 שלח תגובה לשמעון', custom_id: BUTTON_ID
      })
    ],
    flags: MessageFlags.Ephemeral
  };
}

async function showDmFallbackModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('📨 תגובה לשמעון')
    .addComponents(createFallbackRow());
  await interaction.showModal(modal);
}

async function handleDmFallbackModalSubmit(interaction, client) {
  const content = interaction.fields.getTextInputValue(INPUT_ID);
  
  // יצירת הודעה וירטואלית עבור ה-AI
  const fakeMessage = {
    content,
    author: interaction.user,
    guild: null,
    channel: interaction.channel,
    member: interaction.member || { displayName: interaction.user.username }
  };

  try {
    // שליחה למוח
    await smartRespond(fakeMessage);
    
    // תיעוד בהיסטוריה של המשתמש
    const userRef = await getUserRef(interaction.user.id, 'discord');
    await userRef.update({
        'history.dmResponses': admin.firestore.FieldValue.arrayUnion({
            content: content,
            timestamp: new Date().toISOString(),
            method: 'modal_fallback'
        }),
        'tracking.lastActive': new Date().toISOString()
    });

    await interaction.reply({
      content: '✅ שמעון קיבל את ההודעה שלך והגיב בהתאם.',
      flags: MessageFlags.Ephemeral
    });
  } catch (err) {
    console.error('❌ שגיאה ב-DM Fallback:', err);
    if (!interaction.replied) await interaction.reply({ content: '❌ שגיאה.', flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
    BUTTON_ID, MODAL_ID,
    sendFallbackButton,
    showDmFallbackModal,
    handleDmFallbackModalSubmit
};