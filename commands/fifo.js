const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { createGroupsAndChannels } = require('../utils/squadBuilder');
const { log } = require('../utils/logger');
const { startGroupTracking } = require('../handlers/groupTracker');
const { resetReplayVotes, registerTeam } = require('../utils/replayManager');
const { playTTSInVoiceChannel } = require('../utils/ttsQuickPlay');
const { synthesizeElevenTTS } = require('../tts/ttsEngine.elevenlabs');
const { deletePreviousFifoMessages, setFifoMessages } = require('../utils/fifoMemory');

const TEAM_COLORS = ['🟦', '🟥', '🟩', '🟨', '🟪', '⬛'];
const PUBLIC_CHANNEL_ID = '1372283521447497759';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('פיפו')
    .setDescription('מחלק את המשתמשים בקול לקבוצות לפי כמות מבוקשת')
    .addIntegerOption(opt =>
      opt.setName('כמות').setDescription('כמה שחקנים בקבוצה (2, 3 או 4)').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Connect),

  async execute(interaction) {
    try {
      resetReplayVotes();
      await deletePreviousFifoMessages(interaction.guild.id);
      const fifoMessages = [];

      const groupSize = interaction.options.getInteger('כמות');
      const validSizes = [2, 3, 4];
      if (!validSizes.includes(groupSize)) {
        return await interaction.reply({ content: '🤨 רק 2, 3 או 4 מותרים.', ephemeral: true });
      }

      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel || voiceChannel.parentId !== process.env.FIFO_CATEGORY_ID) {
        return await interaction.reply({ content: '⛔ אתה חייב להיות בחדר בתוך קטגוריית וורזון פיפו.', ephemeral: true });
      }

      const role = interaction.guild.roles.cache.find(r => r.name === 'FIFO');
      if (!interaction.member.roles.cache.has(role?.id)) {
        return await interaction.reply({ content: '🚫 אתה צריך תפקיד FIFO כדי להריץ את הפקודה.', ephemeral: true });
      }

      const members = voiceChannel.members.filter(m => !m.user.bot);
      if (members.size < 2) {
        return await interaction.reply({ content: '🤏 צריך לפחות שני שחקנים.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const { groups, waiting, channels } = await createGroupsAndChannels({
        interaction,
        members: [...members.values()],
        groupSize,
        categoryId: process.env.FIFO_CATEGORY_ID,
        openChannels: true
      });

      const publicChannel = await interaction.guild.channels.fetch(PUBLIC_CHANNEL_ID).catch(() => null);
      if (publicChannel?.isTextBased()) {
        for (let i = 0; i < groups.length; i++) {
          const group = groups[i];
          const teamName = `TEAM ${String.fromCharCode(65 + i)}`;
          const names = group.map(m => m.displayName).join(', ');
          const icon = TEAM_COLORS[i] || '🎯';

          const embed = new EmbedBuilder()
            .setTitle(`${icon} ${teamName}`)
            .setDescription(`**שחקנים:**\n${names}`)
            .setColor(0x00AEFF)
            .setTimestamp();

          const button = new ButtonBuilder()
            .setCustomId(`replay_${teamName.replace(' ', '_')}`)
            .setLabel('🔄 איפוס קבוצה')
            .setStyle(ButtonStyle.Secondary);

          const row = new ActionRowBuilder().addComponents(button);
          const msg = await publicChannel.send({ embeds: [embed], components: [row] });
          fifoMessages.push(msg);

          if (channels[i]) {
            const userIds = group.map(m => m.id);
            startGroupTracking(channels[i], userIds, teamName);
            registerTeam(teamName, userIds);

            try {
              await new Promise(res => setTimeout(res, 5000));
              for (const member of group) {
                try { await member.voice.setMute(true, 'שמעון משתיק'); } catch {}
              }

              const intro = `שלום ל־${teamName}... שמעון איתכם.`;
              const nameList = `נראה לי שפה יש לנו את: ${group.map(m => m.displayName).join(', ')}`;
              const roast = 'טוב, עם ההרכב הזה אני לא מצפה לכלום. בהצלחה עם ריספawns 🎮';

              const buffer = Buffer.concat([
                await synthesizeElevenTTS(intro),
                await synthesizeElevenTTS(nameList),
                await synthesizeElevenTTS(roast)
              ]);

              await playTTSInVoiceChannel(channels[i], buffer);

              await new Promise(res => setTimeout(res, 5000));
              for (const member of group) {
                try { await member.voice.setMute(false, 'שמעון סיים'); } catch {}
              }
            } catch (err) {
              console.error(`❌ שגיאה בברכת שמעון לקבוצה ${teamName}:`, err.message);
            }
          }
        }
      }

      const groupSummary = groups
        .map((group, i) => `**TEAM ${String.fromCharCode(65 + i)}**: ${group.map(m => m.displayName).join(', ')}`)
        .join('\n');

      const waitingText = waiting.length
        ? `\n⏳ ממתינים: ${waiting.map(m => m.displayName).join(', ')}`
        : '';

      await interaction.editReply({
        content: `✅ החלוקה בוצעה:\n${groupSummary}${waitingText}`
      });

      const resetButton = new ButtonBuilder()
        .setCustomId(`reset_all_${interaction.user.id}`)
        .setLabel('🚨 אפס הכל')
        .setStyle(ButtonStyle.Danger);

      const resetRow = new ActionRowBuilder().addComponents(resetButton);

      const resetMsg = await publicChannel.send({
        content: `📛 **רק <@${interaction.user.id}> יכול לאפס את כל הקבוצות.**\n⌛ הכפתור יוסר בעוד 5 דקות.`,
        components: [resetRow]
      });

      fifoMessages.push(resetMsg);
      setFifoMessages(interaction.guild.id, fifoMessages);

      setTimeout(async () => {
        try {
          await resetMsg.delete();
          console.log('🗑️ הודעת האיפוס הכללי נמחקה.');
        } catch (err) {
          console.warn('⚠️ לא ניתן היה למחוק את הודעת האיפוס:', err.message);
        }
      }, 5 * 60 * 1000);

      log(`📊 ${interaction.user.tag} הריץ /פיפו עם ${members.size} שחקנים (גודל קבוצה: ${groupSize})`);
    } catch (err) {
      console.error('❌ שגיאה בפיפו:', err);
      log(`❌ שגיאה ב־/פיפו ע״י ${interaction.user.tag}:\n\`\`\`${err.message || err}\`\`\``);

      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: '❌ תקלה כללית. נסה שוב.', ephemeral: true });
      } else {
        await interaction.editReply({ content: '❌ משהו השתבש. נסה שוב.' });
      }
    }
  }
};
