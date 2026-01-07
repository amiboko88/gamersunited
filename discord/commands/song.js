// 📁 commands/שיר.js (משודרג לשימוש ב-voiceQueue הראשי)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const voiceQueue = require('../handlers/music/player')
const podcastManager = require('../handlers/podcastManager'); 

const musicDir = path.join(__dirname, '..', 'music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('שירים')
    .setDescription('השמע שיר מהשרת')
    .addStringOption(option =>
      option
        .setName('שם')
        .setDescription('בחר שיר')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction, client) {
    if (podcastManager.getPodcastStatus()) {
        return interaction.reply({ 
            content: 'שמעון עסוק כרגע בפודקאסט ולא ניתן להפריע לו!', 
            flags: MessageFlags.Ephemeral 
        });
    }
      
    const songName = interaction.options.getString('שם');
    const filePath = path.join(musicDir, `${songName}.mp3`);

    if (!fs.existsSync(filePath)) {
      return interaction.reply({ content: '❌ הקובץ לא נמצא.', flags: MessageFlags.Ephemeral });
    }

    const member = interaction.member;
    const channel = member.voice?.channel;
    if (!channel) {
      return interaction.reply({ content: '🔇 אתה לא בערוץ קולי.', flags: MessageFlags.Ephemeral });
    }

    try {
        // ✅ [שדרוג] שלח הודעת "נוסף לתור"
        const embed = new EmbedBuilder()
          .setColor('Purple')
          .setTitle('🎶 נוסף לתור')
          .setDescription(`**${songName}**`)
          .setFooter({ text: 'שמעון נגן – מוזיקה איכותית בלבד 🎧' })
          .setTimestamp();

        // ✅ [שדרוג] יוצר את הכפתורים בפעם הראשונה
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pause').setLabel('השהה').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('stop').setLabel('עצור').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
        );

        // שולח את ההודעה ומעביר את האינטראקציה לתור
        await interaction.reply({ embeds: [embed], components: [row] });
        
        // שולח ל-voiceQueue הראשי עם נתיב הקובץ והאינטראקציה
        voiceQueue.addToQueue(channel.guild.id, channel.id, filePath, client, 'SONG', interaction, songName);

    } catch (error) {
        log(`❌ [SONG] שגיאה בשליחת הודעה או הוספה לתור:`, error);
        if (!interaction.replied) {
            await interaction.reply({ content: '❌ אירעה שגיאה.', flags: MessageFlags.Ephemeral });
        }
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const files = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'));

    const choices = files.map(file => path.parse(file).name);
    const filtered = choices.filter(c => c.toLowerCase().includes(focused.toLowerCase()));

    await interaction.respond(
      filtered.slice(0, 25).map(name => ({ name, value: name }))
    );
  }
};