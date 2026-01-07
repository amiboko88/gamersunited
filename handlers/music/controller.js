// 📁 handlers/music/controller.js
const { MessageFlags } = require('discord.js');
const musicPlayer = require('./player'); // מדבר ישירות עם הנגן באותה תיקייה
const { log } = require('../../utils/logger');

module.exports = {
    // מזהה אם האינטראקציה שייכת למוזיקה
    isMusicButton: (customId) => ['pause', 'resume', 'stop', 'new_song'].includes(customId),

    async execute(interaction) {
        const { customId, guildId } = interaction;
        const queue = musicPlayer.queues.get(guildId);

        // הגנות בסיסיות
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '🔇 עליך להיות בערוץ קולי.', flags: MessageFlags.Ephemeral });
        }

        // כפתור "שיר נוסף" - רק מפנה לפקודה
        if (customId === 'new_song') {
            return interaction.reply({ content: '🎵 השתמש בפקודה `/שירים` כדי להוסיף שיר.', flags: MessageFlags.Ephemeral });
        }

        if (!queue || !queue.player) {
            await interaction.reply({ content: '🎵 הנגן לא פעיל.', flags: MessageFlags.Ephemeral });
            // ניקוי הודעות ישנות אם הנגן מת
            if (interaction.message.deletable) interaction.message.delete().catch(() => {});
            return;
        }

        try {
            await interaction.deferUpdate(); 
            let success = false;

            switch (customId) {
                case 'pause':
                    success = musicPlayer.pause(guildId);
                    if (success) await musicPlayer.updateNowPlaying(queue, { type: 'SONG' }, true); // עדכון כפתור
                    break;

                case 'resume':
                    success = musicPlayer.resume(guildId);
                    if (success) await musicPlayer.updateNowPlaying(queue, { type: 'SONG' }, false); // עדכון כפתור
                    break;

                case 'stop':
                    success = musicPlayer.stop(guildId);
                    // הודעת הנגן נמחקת אוטומטית ע"י ה-player
                    break;
            }
        } catch (error) {
            log(`❌ Music Controller Error: ${error.message}`);
        }
    }
};