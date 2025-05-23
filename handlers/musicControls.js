// 📁 handlers/musicControls.js
const { ButtonInteraction } = require('discord.js');
const songCommand = require('../commands/שיר');

const pauseRoasts = [
  "נראה לך אני פה בשביל קונצרטים פרטיים? 🤡",
  "אני בוט, לא דיסק און קי. תחליט מהר.",
  "⏳ מחכה שתחזור… אה לא, בעצם לא.",
  "הפסקת לשמוע? גם אני. ביי.",
  "תגיד תודה שאני לא מוחק אותך מהשרת.",
  "מה אתה חושב שזה? ספוטיפיי פרימיום?",
  "לא שילמת? לא מקבל המשך!",
  "יאללה ביי, תתאמן על פינג קודם.",
  "הקהל התפזר, אני גם.",
  "אפילו גוסט לא חיכה ככה."
];

const pauseTimers = new Map(); // guildId → timeout

module.exports = async function handleMusicControls(interaction) {
  if (!(interaction instanceof ButtonInteraction)) return;

  const guildId = interaction.guildId;
  const state = songCommand.getState(guildId);
  if (!state) {
    return interaction.reply({ content: '🎵 אין כרגע שיר פעיל.', ephemeral: true });
  }

  const { player } = state;

  if (interaction.customId === 'pause') {
    if (player.pause()) {
      const elapsed = player._state.playbackDuration || 0;
      songCommand.setPausedAt(guildId, elapsed);

      await interaction.reply({ content: '⏸️ השיר הושהה.', ephemeral: true });

      const msg = await interaction.fetchReply();
      const timer = setTimeout(async () => {
        try {
          await msg.delete().catch(() => {});
          const roast = pauseRoasts[Math.floor(Math.random() * pauseRoasts.length)];
          await interaction.channel.send({ content: `💬 ${roast}` });
        } catch {}
        pauseTimers.delete(guildId);
      }, 60_000);

      pauseTimers.set(guildId, timer);
    } else {
      await interaction.reply({ content: '❌ לא ניתן להשהות.', ephemeral: true });
    }
  }

  if (interaction.customId === 'resume') {
    try {
      songCommand.resumePlayback(guildId);
      await interaction.reply({ content: '▶️ ממשיך לנגן מהנקודה האחרונה...', ephemeral: true });

      if (pauseTimers.has(guildId)) {
        clearTimeout(pauseTimers.get(guildId));
        pauseTimers.delete(guildId);
      }
    } catch {
      await interaction.reply({ content: '❌ שגיאה בהמשך הנגינה.', ephemeral: true });
    }
  }

  if (interaction.customId === 'stop') {
    player.stop(true);
    songCommand.clearState(guildId);

    if (pauseTimers.has(guildId)) {
      clearTimeout(pauseTimers.get(guildId));
      pauseTimers.delete(guildId);
    }

    await interaction.reply({ content: '⏹️ הנגינה נעצרה.', ephemeral: true });
  }
};
