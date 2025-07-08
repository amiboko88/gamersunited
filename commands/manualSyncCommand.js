// 📁 commands/manualSyncCommand.js

const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../utils/firebase');
const { scanForConsoleAndVerify } = require('../handlers/verificationButton');

const VERIFIED_ROLE_ID = '1120787309432938607';
const TRACKING_COLLECTION = 'memberTracking';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('סנכרון_ידני')
    .setDescription('סרוק את כל המאומתים שלא נרשמו למסד הנתונים והוסף אותם')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!verifiedRole) {
      return interaction.editReply('❌ תפקיד המאומת לא נמצא בשרת.');
    }

    const snapshot = await db.collection(TRACKING_COLLECTION).get();
    const alreadyTracked = new Set(snapshot.docs.map(doc => doc.id));

    const missingMembers = verifiedRole.members.filter(member =>
      !member.user.bot && !alreadyTracked.has(member.id)
    );

    if (missingMembers.size === 0) {
      return interaction.editReply('✅ כל המשתמשים המאומתים כבר מתועדים במסד.');
    }

    const displayList = [...missingMembers.values()]
      .slice(0, 20)
      .map(m => `• ${m.user.tag} (${m.id})`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🛠 משתמשים מאומתים ללא רישום במסד')
      .setDescription(
        `${missingMembers.size} משתמשים נמצאו עם תפקיד מאומת אך ללא תיעוד.\n\n` +
        `${displayList}${missingMembers.size > 20 ? '\n\n...ועוד נוספים.' : ''}`
      )
      .setColor(0xffc107);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`manualSync::${interaction.user.id}`)
        .setLabel('🛠 הוסף למסד')
        .setStyle(ButtonStyle.Success)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });
  },

  // ✳️ הנדלר ללחיצה על הכפתור
  async handleButtonInteraction(interaction) {
    const [_, userId] = interaction.customId.split('::');

    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: '⛔ רק מי שהפעיל את הפקודה יכול ללחוץ על הכפתור הזה.',
        flags: MessageFlags.Ephemeral
      });
    }

    const guild = interaction.guild;
    const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!verifiedRole) {
      return interaction.reply({ content: '❌ תפקיד המאומת לא נמצא בשרת.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const snapshot = await db.collection(TRACKING_COLLECTION).get();
    const alreadyTracked = new Set(snapshot.docs.map(doc => doc.id));

    const missingMembers = verifiedRole.members.filter(member =>
      !member.user.bot && !alreadyTracked.has(member.id)
    );

    if (missingMembers.size === 0) {
      return interaction.editReply('✅ אין משתמשים שדורשים סנכרון.');
    }

    let count = 0;
    for (const member of missingMembers.values()) {
      try {
        await scanForConsoleAndVerify(member);
        count++;
      } catch (err) {
        console.warn(`❌ שגיאה בסנכרון ${member.user.tag}:`, err.message);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ סנכרון בוצע בהצלחה')
      .setDescription(`🧾 ${count} משתמשים עודכנו ונרשמו למסד הנתונים.`)
      .setColor(0x2ecc71);

    await interaction.editReply({ embeds: [embed], components: [] });
  }
};
