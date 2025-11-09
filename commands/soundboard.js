// 📁 commands/soundboard.js (משודרג לשימוש ב-voiceQueue הראשי)
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { log } = require('../utils/logger');
const voiceQueue = require('../handlers/voiceQueue');
const fs = require('fs');
const path = require('path');
const statTracker = require('../handlers/statTracker');
const podcastManager = require('../handlers/podcastManager'); 

const soundsDir = path.join(__dirname, '..', 'sounds');
const COOLDOWN_SECONDS = 15;
const lastUsedTimestamps = new Map();

const availableSounds = [
  { name: '🐐', value: 'goat' },
  { name: '🤯', value: 'headshot' },
  { name: '💥', value: 'boom' },
  { name: '👏', value: 'clap' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('סאונדבורד')
    .setDescription('מפעיל סאונד קצר בערוץ הקולי')
    .addStringOption(opt =>
      opt
        .setName('שם')
        .setDescription('בחר סאונד')
        .setRequired(true)
        .addChoices(...availableSounds.map(s => ({ name: s.name, value: s.value })))
    ),

  async execute(interaction, client) {
    if (podcastManager.getPodcastStatus()) {
        return interaction.reply({ 
            content: 'שמעון עסוק כרגע בפודקאסט ולא ניתן להפריע לו!', 
            flags: MessageFlags.Ephemeral 
        });
    }

    const userId = interaction.user.id;
    const now = Date.now();
    const lastUsed = lastUsedTimestamps.get(userId) || 0;

    if (now - lastUsed < COOLDOWN_SECONDS * 1000) {
      const secondsLeft = Math.ceil((COOLDOWN_SECONDS * 1000 - (now - lastUsed)) / 1000);
      return interaction.reply({
        content: `🕒 אנא המתן ${secondsLeft} שניות בין הפעלות.`,
        flags: MessageFlags.Ephemeral
      });
    }

    const soundName = interaction.options.getString('שם');
    const filePath = path.join(soundsDir, `${soundName}.mp3`);
    if (!fs.existsSync(filePath)) {
      return interaction.reply({ content: '❌ הקובץ לא נמצא.', flags: MessageFlags.Ephemeral });
    }

    const member = interaction.member;
    const channel = member.voice?.channel;
    if (!channel) {
      return interaction.reply({ content: '🔇 עליך להיות בערוץ קול כדי לשמוע את הסאונד.', flags: MessageFlags.Ephemeral });
    }

    lastUsedTimestamps.set(userId, now);
    await statTracker.trackSoundUse(userId); 

    try {
        // ✅ [שדרוג] שליחה ל-voiceQueue הראשי עם נתיב הקובץ
        voiceQueue.addToQueue(channel.guild.id, channel.id, filePath, client, 'SOUNDBOARD');
        
        await interaction.reply({ content: `🎵 משמיע: ${soundName}` });
        // מחיקה אוטומטית של ההודעה אחרי 5 שניות
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);

    } catch (error) {
        log(`❌ [SOUNDBOARD] שגיאה בהוספה לתור:`, error);
        await interaction.reply({ content: '❌ אירעה שגיאה בניגון הסאונד.', flags: MessageFlags.Ephemeral });
    }
  }
};