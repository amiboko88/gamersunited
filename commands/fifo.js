// 📁 commands/fifo.js
// --- ✅ [תיקון] הסרת ייבוא מיותר ---
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createGroupsAndChannels, cleanupFifo, buildTeamMessage } = require('../utils/squadBuilder');
const { log } = require('../utils/logger');
const { startGroupTracking } = require('../handlers/groupTracker');
// --- ✅ [תיקון] הסרת התלות ב-'teams' ---
const { resetReplayVotes, registerTeam, addResetVote, hasEnoughVotesToReset } = require('../utils/replayManager');
const { playTTSInVoiceChannel } = require('../utils/ttsQuickPlay');
const { deletePreviousFifoMessages, setFifoMessages } = require('../utils/fifoMemory');

const TEAM_COLORS = ['#3498DB', '#E74C3C', '#2ECC71', '#F1C40F', '#9B59B6', '#34495E'];
const PUBLIC_CHANNEL_ID = '1372283521447497759';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('פיפו')
    .setDescription('מחלק את המשתמשים בקול לקבוצות לפי כמות מבוקשת')
    .addIntegerOption(opt =>
      opt.setName('כמות').setDescription('כמה שחקנים בקבוצה (2, 3, 4...)').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await deletePreviousFifoMessages(interaction.guild.id);

    const groupSize = interaction.options.getInteger('כמות');
    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    const publicChannel = interaction.guild.channels.cache.get(PUBLIC_CHANNEL_ID);

    if (!voiceChannel) return interaction.editReply('אתה צריך להיות בערוץ קולי כדי להשתמש בפקודה.');
    if (!publicChannel) return interaction.editReply('לא נמצא ערוץ טקסט ציבורי להצגת התוצאות.');
    
    const members = voiceChannel.members.filter(m => !m.user.bot);
    if (members.size < groupSize) return interaction.editReply(`אין מספיק שחקנים לחלוקה לקבוצות של ${groupSize}.`);

    const fifoMessages = [];
    const teamData = []; // ✅ מקור האמת היחיד לכל המידע על הקבוצות

    try {
      const { channels, squads, waiting } = await createGroupsAndChannels({
        interaction,
        members: [...members.values()],
        groupSize,
        categoryId: voiceChannel.parentId
      });

      let groupSummary = '';
      for (let i = 0; i < squads.length; i++) {
        const squad = squads[i];
        const teamName = `TEAM ${String.fromCharCode(65 + i)}`;
        const color = TEAM_COLORS[i % TEAM_COLORS.length];
        
        groupSummary += `${color} **${teamName}**: ${squad.map(m => `<@${m.id}>`).join(', ')}\n`;
        
        const teamMessagePayload = buildTeamMessage(teamName, squad, i);
        const teamMsg = await channels[i].send(teamMessagePayload);
        
        // שמירת כל המידע במקום אחד
        teamData.push({ name: teamName, channel: channels[i], message: teamMsg, members: squad });

        startGroupTracking(channels[i], squad.map(m => m.id), teamName);
        registerTeam(teamName, squad.map(m => ({ id: m.id, name: m.displayName })));
        
        try {
          await playTTSInVoiceChannel(channels[i], `קבוצה ${teamName}`);
          await new Promise(resolve => setTimeout(resolve, 500));
          await playTTSInVoiceChannel(channels[i], squad.map(m => m.displayName).join(', '));
        } catch (ttsError) {
          log(`⚠️ שגיאה בהכרזת קבוצה ${teamName}, ממשיך הלאה...`, ttsError);
        }
      }

      await resetReplayVotes();
      
      let waitingText = waiting.length > 0 ? `\n**⚪ ממתינים:** ${waiting.map(m => `<@${m.id}>`).join(', ')}` : '';

      const publicMsg = await publicChannel.send(`## חלוקת FIFO בוצעה!\n${groupSummary}${waitingText}`);
      fifoMessages.push(publicMsg);
      
      const resetButton = new ButtonBuilder().setCustomId(`reset_all_${interaction.user.id}`).setLabel('🚨 אפס הכל').setStyle(ButtonStyle.Danger);
      const resetRow = new ActionRowBuilder().addComponents(resetButton);
      const resetMsg = await publicChannel.send({ content: `📛 **רק <@${interaction.user.id}> יכול לאפס את כל הקבוצות.**`, components: [resetRow] });

      fifoMessages.push(resetMsg);
      setFifoMessages(interaction.guild.id, fifoMessages);
      await interaction.editReply({ content: `✅ החלוקה בוצעה! בדוק את ערוץ ${publicChannel.toString()}` });
      
      const allMessages = teamData.map(td => td.message).concat(resetMsg);
      const collector = publicChannel.createMessageComponentCollector({
        filter: i => i.customId.startsWith('reset_'),
        time: 30 * 60 * 1000
      });

      collector.on('collect', async i => {
        if (i.customId.startsWith('reset_all_')) {
          if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'רק מי שיצר את הפיפו יכול לאפס.', ephemeral: true });
          }
          await i.deferUpdate();
          log(`🚨 ${i.user.tag} לחץ על איפוס כללי`);
          await cleanupFifo(interaction, voiceChannel);
          await deletePreviousFifoMessages(interaction.guild.id);
          collector.stop('manual_reset');
          return;
        }

        if (i.customId.startsWith('reset_team_')) {
          const teamName = i.customId.replace('reset_team_', '');
          const voterTeam = teamData.find(td => td.name === teamName);
          if (!voterTeam || !voterTeam.members.some(m => m.id === i.user.id)) {
              return i.reply({ content: 'אינך חבר בקבוצה זו.', ephemeral: true });
          }

          const voteAdded = addResetVote(i.user.id, teamName);
          if (!voteAdded) {
            return i.reply({ content: 'כבר הצבעת לאיפוס.', ephemeral: true });
          }

          if (hasEnoughVotesToReset(teamName)) {
            await i.reply({ content: `**${teamName}** אישרה איפוס! מעביר אתכם בחזרה...`, ephemeral: false });
            
            for (const member of voterTeam.members) {
                await member.voice.setChannel(voiceChannel).catch(()=>{});
            }
            
            // ✅ [תיקון] מציאת הקבוצה היריבה מתוך מקור האמת היחיד
            const opponentTeam = teamData.find(td => td.name !== teamName);
            if (opponentTeam) {
                await playTTSInVoiceChannel(opponentTeam.channel, `קבוצת ${teamName} התפרקה. אתם יכולים לחזור לערוץ הראשי.`);
            }
          } else {
            const teamSize = voterTeam.members.length;
            const currentVotes = votes.get(teamName)?.size || 0;
            await i.reply({ content: `הצבעתך לאיפוס התקבלה! (${currentVotes}/${teamSize})`, ephemeral: true });
          }
        }
      });

      collector.on('end', async (collected, reason) => {
          await deletePreviousFifoMessages(interaction.guild.id);
          if (reason !== 'manual_reset') {
            await cleanupFifo(interaction);
          }
      });

      log(`📊 ${interaction.user.tag} הריץ /פיפו עם ${members.size} שחקנים (גודל קבוצה: ${groupSize})`);
    } catch (err) {
      log('❌ שגיאה בפקודת /פיפו:', err);
      await interaction.editReply('אירעה שגיאה קריטית בעת חלוקת הקבוצות.');
    }
  }
};