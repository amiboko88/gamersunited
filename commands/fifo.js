// 📁 commands/fifo.js (גרסה סופית ומשולבת)
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { createGroupsAndChannels, cleanupFifo, buildTeamMessage } = require('../utils/squadBuilder');
const { log } = require('../utils/logger');
const { startGroupTracking } = require('../handlers/groupTracker');
const { resetReplayVotes, registerTeam, addResetVote, hasEnoughVotesToReset, getVoteCount, hasBothTeamsVoted, getAllTeams } = require('../utils/replayManager');
const { playTTSInVoiceChannel } = require('../utils/ttsQuickPlay');
const { deletePreviousFifoMessages, setFifoMessages } = require('../utils/fifoMemory');

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
    if (members.size < 2) return interaction.editReply(`צריך לפחות 2 שחקנים כדי לבצע חלוקה.`);

    const fifoMessages = [];
    const teamData = [];

    try {
        const { channels, squads, waiting } = await createGroupsAndChannels({ interaction, members: [...members.values()], groupSize, categoryId: voiceChannel.parentId });
        if (squads.length === 0) return interaction.editReply(`אין מספיק שחקנים לחלוקה לקבוצות של ${groupSize}.`);

        await resetReplayVotes();
      
        const summaryEmbed = new EmbedBuilder()
            .setTitle('🏁 חלוקת FIFO הושלמה!')
            .setColor('#7289DA')
            .setTimestamp()
            .setFooter({ text: `בוצע על ידי ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

        for (let i = 0; i < squads.length; i++) {
            const squad = squads[i];
            const teamName = `TEAM ${String.fromCharCode(65 + i)}`;
            
            summaryEmbed.addFields({ name: `\u200F${teamName} (${squad.length} שחקנים)`, value: squad.map(m => `<@${m.id}>`).join('\n'), inline: true });
            
            // ✅ [שדרוג] כפתורי Replay ו-Reset משולבים בהודעה אחת
            const teamMessagePayload = buildTeamMessage(teamName, squad, i);
            const teamMsg = await channels[i].send(teamMessagePayload);
            
            const registeredTeam = registerTeam(teamName, squad.map(m => ({ id: m.id, name: m.displayName })));
            teamData.push({ name: teamName, channel: channels[i], message: teamMsg, members: squad, size: registeredTeam.size });

            startGroupTracking(channels[i], squad.map(m => m.id), teamName);
            
            try {
              await playTTSInVoiceChannel(channels[i], `קבוצה ${teamName}`);
              await new Promise(resolve => setTimeout(resolve, 500));
              await playTTSInVoiceChannel(channels[i], squad.map(m => m.displayName).join(', '));
            } catch (ttsError) { log(`⚠️ שגיאה בהכרזת קבוצה ${teamName}:`, ttsError); }
        }

        if (waiting.length > 0) {
            summaryEmbed.addFields({ name: '⚪ ממתינים', value: waiting.map(m => `<@${m.id}>`).join('\n'), inline: true });
        }

        const publicMsg = await publicChannel.send({ embeds: [summaryEmbed] });
        fifoMessages.push(publicMsg);
      
        const resetButton = new ButtonBuilder().setCustomId(`reset_all_${interaction.user.id}`).setLabel('🚨 אפס הכל').setStyle(ButtonStyle.Danger);
        const resetRow = new ActionRowBuilder().addComponents(resetButton);
        const resetMsg = await publicChannel.send({ content: `📛 **רק <@${interaction.user.id}> יכול לאפס את כל הקבוצות.**`, components: [resetRow] });

        fifoMessages.push(resetMsg);
        setFifoMessages(interaction.guild.id, fifoMessages);
        await interaction.editReply({ content: `✅ החלוקה בוצעה! בדוק את ערוץ ${publicChannel.toString()}` });
      
        const collector = publicChannel.createMessageComponentCollector({ filter: i => i.customId.startsWith('reset_') || i.customId.startsWith('replay_'), time: 30 * 60 * 1000 });

        collector.on('collect', async i => {
            try {
                if (i.customId.startsWith('reset_all_')) {
                    if (i.user.id !== interaction.user.id) return i.reply({ content: 'רק מי שיצר את הפיפו יכול לאפס.', ephemeral: true });
                    await i.deferUpdate();
                    await cleanupFifo(interaction, voiceChannel);
                    await deletePreviousFifoMessages(interaction.guild.id);
                    collector.stop('manual_reset');
                    return;
                }
    
                const teamName = i.customId.split('_')[1]; // reset_team_A -> team, replay_A -> A
                const voterTeam = teamData.find(td => td.members.some(m => m.id === i.user.id));
                
                if (!voterTeam || !i.customId.includes(teamName)) return i.reply({ content: 'אינך חבר בקבוצה הרלוונטית.', ephemeral: true });

                // ✅ [שולב] לוגיקה עבור כפתור Replay
                if (i.customId.startsWith('replay_')) {
                    const voteAdded = addResetVote(i.user.id, teamName); // משתמשים באותה מערכת הצבעה
                    if (!voteAdded) return i.reply({ content: 'כבר הצבעת.', ephemeral: true });

                    await i.reply({ content: `💬 הצבעתך ל-Replay נרשמה! (${getVoteCount(teamName)}/${voterTeam.size})`, ephemeral: true });

                    if (hasBothTeamsVoted()) {
                        log(`♻️ שתי הקבוצות הצביעו – מתבצע איפוס מלא.`);
                        await cleanupFifo(interaction, voiceChannel);
                        await publicChannel.send(`**שתי הקבוצות הסכימו ל-Replay!** מאפס את הקבוצות ומחזיר את כולם לערוץ הראשי.`);
                    }
                    return;
                }

                // לוגיקה עבור איפוס קבוצה בודדת
                if (i.customId.startsWith('reset_team_')) {
                    const voteAdded = addResetVote(i.user.id, teamName);
                    if (!voteAdded) return i.reply({ content: 'כבר הצבעת לאיפוס.', ephemeral: true });
    
                    if (hasEnoughVotesToReset(teamName, voterTeam.size)) {
                        await i.reply({ content: `**${teamName}** אישרה איפוס! מעביר אתכם בחזרה...`, ephemeral: false });
                        for (const member of voterTeam.members) {
                            await member.voice.setChannel(voiceChannel).catch(()=>{});
                        }
                    } else {
                        await i.reply({ content: `הצבעתך לאיפוס התקבלה! (${getVoteCount(teamName)}/${voterTeam.size})`, ephemeral: true });
                    }
                }
            } catch (err) { log('❌ שגיאה בתוך ה-Collector של פיפו:', err); }
        });

        collector.on('end', async (collected, reason) => {
            await deletePreviousFifoMessages(interaction.guild.id);
            if (reason !== 'manual_reset') await cleanupFifo(interaction, voiceChannel);
        });

        log(`📊 ${interaction.user.tag} הריץ /פיפו עם ${members.size} שחקנים.`);
    } catch (err) {
        log('❌ שגיאה בפקודת /פיפו:', err);
        await interaction.editReply('אירעה שגיאה קריטית בעת חלוקת הקבוצות.');
    }
  }
};