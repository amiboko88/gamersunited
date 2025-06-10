// 📁 voiceRecorder.js
const {
  joinVoiceChannel,
  EndBehaviorType
} = require('@discordjs/voice');
const { createWriteStream } = require('fs');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require('discord.js');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR);

const ALLOWED_ROLE_IDS = [
  '1372701819167440957', // MVP
  '853024162603597886',  // BOOSTER
  '1133753472966201555'  // ADMIN
];

const dailyLimits = new Map(); // userId → count

function canRecord(member) {
  return member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id));
}

function getUserDailyCount(userId) {
  const today = dayjs().format('YYYY-MM-DD');
  const key = `${userId}_${today}`;
  return dailyLimits.get(key) || 0;
}

function incrementUserCount(userId) {
  const today = dayjs().format('YYYY-MM-DD');
  const key = `${userId}_${today}`;
  dailyLimits.set(key, getUserDailyCount(userId) + 1);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('הקלט')
    .setDescription('מתחיל הקלטה של הערוץ שלך ל־30 שניות (למורשים בלבד)'),
  async execute(interaction) {
    const member = interaction.member;

    if (!canRecord(member)) {
      return interaction.reply({
        content: '❌ אין לך הרשאה להקליט. נדרש תפקיד MVP / Booster / Admin.',
        ephemeral: true
      });
    }

    if (!member.voice.channel) {
      return interaction.reply({
        content: '🔇 עליך להיות מחובר לערוץ קול כדי להקליט.',
        ephemeral: true
      });
    }

    if (getUserDailyCount(member.id) >= 5) {
      return interaction.reply({
        content: '🛑 הגעת למכסת 5 ההקלטות היומיות שלך.',
        ephemeral: true
      });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_recording')
        .setLabel('✅ אשר הקלטה')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      content: '🎙️ אתה עומד להקליט את הערוץ שלך ל־30 שניות. לחץ על הכפתור כדי לאשר.',
      components: [confirmRow],
      ephemeral: true
    });

    const filter = i =>
      i.customId === 'confirm_recording' &&
      i.user.id === interaction.user.id;

    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      time: 15000,
      max: 1
    });

    collector.on('collect', async i => {
      await i.update({
        content: '⏺️ מתחיל להקליט... המתן 30 שניות.',
        components: []
      });

      const connection = joinVoiceChannel({
        channelId: member.voice.channel.id,
        guildId: member.guild.id,
        adapterCreator: member.guild.voiceAdapterCreator
      });

      const receiver = connection.receiver;

      const timestamp = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const username = interaction.user.username.replace(/[^a-zA-Z0-9]/g, '');
      const fileName = `${timestamp}_${username}_all.pcm`;
      const userDir = path.join(RECORDINGS_DIR, interaction.user.id);
      if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
      const filePath = path.join(userDir, fileName);
      const output = createWriteStream(filePath);

      receiver.speaking.on('start', userId => {
        const audioStream = receiver.subscribe(userId, {
          end: { behavior: EndBehaviorType.AfterSilence, duration: 100 }
        });
        audioStream.pipe(output, { end: false });
      });

      setTimeout(async () => {
        try {
          connection.destroy();
          output.end();
          incrementUserCount(interaction.user.id);
          await interaction.followUp({
            content: `✅ ההקלטה נשמרה: \`${fileName}\``,
            ephemeral: true
          });
        } catch (err) {
          console.error('שגיאה בסיום הקלטה:', err);
        }
      }, 30_000);
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.editReply({
          content: '⌛ ההקלטה בוטלה – לא התקבלה לחיצה בזמן.',
          components: []
        });
      }
    });
  }
};
