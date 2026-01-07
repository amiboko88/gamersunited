// 📁 discord/commands/song.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ✅ תיקון נתיבים (יציאה כפולה לתיקייה הראשית)
const voiceQueue = require('../../handlers/music/player'); 
const podcastManager = require('../../handlers/voice/podcast'); // שים לב: שיניתי למיקום האמיתי של הפודקאסט

// ✅ תיקון נתיב לתיקיית המוזיקה (יציאה משולשת: commands -> discord -> root -> music)
const musicDir = path.join(__dirname, '../../music'); 

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
    // בדיקה אם הפודקאסט פעיל (השתמשתי במתודה בטוחה יותר אם הקודמת לא קיימת)
    // אם אין לך פונקציית getPodcastStatus, אפשר להשתמש בבדיקה ידנית או לוותר עליה כרגע
    if (podcastManager && podcastManager.isPodcastActive) { 
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
        const embed = new EmbedBuilder()
          .setColor('Purple')
          .setTitle('🎶 נוסף לתור')
          .setDescription(`**${songName}**`)
          .setFooter({ text: 'שמעון נגן – מוזיקה איכותית בלבד 🎧' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pause').setLabel('השהה').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('stop').setLabel('עצור').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        
        // שליחה ל-voiceQueue (השתמשתי ב-client מתוך האינטראקציה למקרה שהארגומנט השני ריק)
        voiceQueue.addToQueue(channel.guild.id, channel.id, filePath, interaction.client, 'SONG', interaction, songName);

    } catch (error) {
        console.error(`❌ [SONG] שגיאה בשליחת הודעה או הוספה לתור:`, error);
        if (!interaction.replied) {
            await interaction.reply({ content: '❌ אירעה שגיאה.', flags: MessageFlags.Ephemeral });
        }
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    // בדיקה שהתיקייה קיימת לפני קריאה
    if (!fs.existsSync(musicDir)) return interaction.respond([]);

    const files = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3'));

    const choices = files.map(file => path.parse(file).name);
    const filtered = choices.filter(c => c.toLowerCase().includes(focused.toLowerCase()));

    await interaction.respond(
      filtered.slice(0, 25).map(name => ({ name, value: name }))
    );
  }
};