// 📁 commands/verify.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getUserRef } = require('../utils/userUtils'); // ✅ עבודה מול ה-DB המאוחד
const { logToWebhook } = require('../utils/logger');

const VERIFIED_ROLE_ID = '1120787309432938607';

const data = new SlashCommandBuilder()
  .setName('אימות')
  .setDescription('מאמת אותך ומעניק גישה לשרת (רק אם אין לך תפקידים)');

async function execute(interaction) {
  const member = interaction.member;
  
  // בדיקת בטיחות: שלא יאמת מישהו שכבר יש לו רולים
  if (!member || member.roles.cache.size > 1) {
    return interaction.reply({ 
        content: '❌ אינך רשאי להשתמש בפקודה זו. רק משתמשים חדשים ללא תפקידים יכולים לאמת את עצמם.', 
        flags: MessageFlags.Ephemeral 
    });
  }

  try {
    // 1. קבלת הרפרנס למשתמש המאוחד
    const userRef = await getUserRef(member.id, 'discord');

    // 2. עדכון הסטטוס בתוך תיק המשתמש (במקום ב-dmTracking)
    await userRef.set({
        tracking: {
            verificationStatus: 'verified',
            verificationType: 'manual_slash',
            verifiedAt: new Date().toISOString(),
            // שומרים על שאר המידע אם קיים (כמו joinedAt)
        },
        meta: {
            lastActive: new Date().toISOString()
        }
    }, { merge: true });

    // 3. הענקת הרול בדיסקורד
    await member.roles.add(VERIFIED_ROLE_ID);

    await interaction.reply({ content: '✅ אומתת בהצלחה! ברוך הבא 🎉', flags: MessageFlags.Ephemeral });
    
    logToWebhook({
      title: '🟢 אימות ידני (Slash)',
      description: `המשתמש <@${member.id}> ביצע אימות עצמי דרך הפקודה /אימות.`
    });

  } catch (err) {
    console.error('❌ שגיאה באימות Slash:', err);
    interaction.reply({ content: '⚠️ שגיאה בתהליך האימות. אנא פנה להנהלה.', flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  data,
  execute
};