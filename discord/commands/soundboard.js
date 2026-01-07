// 📁 commands/soundboard.js (משודרג לטעינה דינמית ושימוש ב-voiceQueue)
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { log } = require('../utils/logger');
const voiceQueue = require('../handlers/music/player');
const fs = require('fs');
const path = require('path');
const statTracker = require('../handlers/statTracker');
const podcastManager = require('../handlers/podcastManager'); 

const soundsDir = path.join(__dirname, '..', 'sounds');
const COOLDOWN_SECONDS = 15;
const lastUsedTimestamps = new Map();

// ✅ [שדרוג] טעינה דינמית של קבצי סאונד
let availableSounds = [];
try {
    const files = fs.readdirSync(soundsDir).filter(f => f.endsWith('.mp3'));
    availableSounds = files.map(file => {
        const name = path.parse(file).name;
        // מנסה למצוא אימוג'י מתאים לפי שם
        let emoji = '🔊';
        if (name.includes('goat')) emoji = '🐐';
        if (name.includes('headshot')) emoji = '🤯';
        if (name.includes('boom')) emoji = '💥';
        if (name.includes('clap')) emoji = '👏';
        
        return { name: `${emoji} ${name}`, value: name };
    });
    if (availableSounds.length === 0) {
        log('⚠️ [SOUNDBOARD] לא נמצאו קבצי MP3 בתיקייה /sounds.');
    } else {
        log(`🎵 [SOUNDBOARD] נטענו ${availableSounds.length} סאונדים: ${availableSounds.map(s => s.value).join(', ')}`);
    }
} catch (error) {
    log('❌ [SOUNDBOARD] שגיאה בקריאת תיקיית /sounds:', error);
}

const commandData = new SlashCommandBuilder()
    .setName('סאונדבורד')
    .setDescription('מפעיל סאונד קצר בערוץ הקולי')
    .addStringOption(opt =>
      opt
        .setName('שם')
        .setDescription('בחר סאונד')
        .setRequired(true)
        .setAutocomplete(true) // ⬅️ שינינו ל-Autocomplete
    );

module.exports = {
  data: commandData,

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

    // ✅ [שדרוג] בדיקה שהקובץ שנבחר אכן קיים (למקרה שנוסף/נמחק מאז עליית הבוט)
    if (!fs.existsSync(filePath)) {
      log(`⚠️ [SOUNDBOARD] ניסיון לנגן קובץ לא קיים: ${soundName}.mp3`);
      return interaction.reply({ content: '❌ הקובץ הזה כבר לא קיים.', flags: MessageFlags.Ephemeral });
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
  },

  // ✅ [שדרוג] הוספת Autocomplete שקורא דינמית את הקבצים
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    try {
        const files = fs.readdirSync(soundsDir).filter(f => f.endsWith('.mp3'));
        const choices = files.map(file => path.parse(file).name);
        const filtered = choices.filter(c => c.toLowerCase().includes(focused.toLowerCase()));
        await interaction.respond(
          filtered.slice(0, 25).map(name => ({ name, value: name }))
        );
    } catch (error) {
        log('❌ [SOUNDBOARD] שגיאה ב-Autocomplete:', error);
        await interaction.respond([]);
    }
  }
};