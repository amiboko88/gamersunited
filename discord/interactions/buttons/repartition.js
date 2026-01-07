// 📁 discord/interactions/buttons/repartition.js
const { EmbedBuilder, MessageFlags } = require('discord.js');
// ✅ שימוש במנועים החדשים במקום הקבצים שנמחקו
const fifoEngine = require('../../../handlers/fifo/engine');
const fifoManager = require('../../../handlers/fifo/manager'); 
const { log } = require('../../../utils/logger');

const FIFO_CHANNEL_ID = '1231453923387379783'; // וודא שזה ה-ID הנכון
const DEFAULT_GROUP_SIZE = 4; 

module.exports = {
  customId: 'repartition_now',
  type: 'isButton',
  async execute(interaction) {
    log(`🔄 ${interaction.user.tag} לחץ על חלוקה מחדש`);

    const voiceChannel = interaction.guild.channels.cache.get(FIFO_CHANNEL_ID);
    if (!voiceChannel?.isVoiceBased()) {
      return interaction.reply({ content: '⛔ ערוץ הפיפו הראשי אינו זמין כרגע.', flags: MessageFlags.Ephemeral });
    }

    const members = voiceChannel.members.filter(m => !m.user.bot);
    if (members.size < 2) {
      return interaction.reply({ content: '⛔ אין מספיק שחקנים בפיפו לחלוקה מחדש.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // 1. איפוס וניקוי (מחזיר את כולם ללובי ומוחק חדרים)
    // אנחנו מדמים "איפוס" כדי לנקות את הלוח
    if (fifoManager.activeSessions.has(interaction.guild.id)) {
        await fifoManager.resetSession(interaction.guild, fifoManager.activeSessions.get(interaction.guild.id));
    }

    // 2. יצירת קבוצות חדשות (לוגיקה ו-AI)
    const rawSquads = await fifoEngine.createSquads([...members.values()], DEFAULT_GROUP_SIZE);
    const enrichedSquads = await fifoEngine.generateMatchMetadata(interaction.guild.id, rawSquads);

    // 3. יצירת ערוצים והעברה פיזית
    // אנו משתמשים ב-setupChannels הקיים ב-Manager
    const createdChannels = await fifoManager.setupChannels(interaction, enrichedSquads, voiceChannel.parentId, voiceChannel.id);

    // 4. דוח סיכום
    const summaryEmbed = new EmbedBuilder()
      .setTitle('📢 בוצעה חלוקה מחדש!')
      .setDescription(`נוצרו ${enrichedSquads.length} קבוצות חדשות.`)
      .setColor(0x00ff88)
      .setTimestamp();

    enrichedSquads.forEach((squad, i) => {
      summaryEmbed.addFields({
        name: `🛡️ ${squad.name}`,
        value: squad.members.map(m => `<@${m.id}>`).join(', '),
        inline: true
      });
    });
    
    // שליחת הסיכום לערוץ שבו הכפתור נלחץ
    await interaction.channel.send({ embeds: [summaryEmbed] });
    await interaction.editReply({ content: '✅ החלוקה מחדש בוצעה בהצלחה!' });
  }
};