// 📁 index.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

// 🔗 בסיס נתונים ועזרי מערכת
const { registerSlashCommands } = require('./utils/commandsLoader');
const db = require('./utils/firebase');
const { playTTSInVoiceChannel } = require('./utils/ttsQuickPlay');
const { executeReplayReset } = require('./utils/repartitionUtils');
const { createGroupsAndChannels } = require('./utils/squadBuilder');

// 🧠 ניתוח / סטטיסטיקות / XP
const statTracker = require('./handlers/statTracker');
const { handleXPMessage } = require('./handlers/engagementManager');
const { startStatsUpdater } = require('./handlers/statsUpdater');

// 🏆 MVP ו־Reactions
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');

// 📊 לוחות ומעקב
const { startLeaderboardUpdater } = require('./handlers/leaderboardUpdater');

// 🧑‍🤝‍🧑 Replay ופיפו
const { startGroupTracking } = require('./handlers/groupTracker');
const {
  registerReplayVote,
  resetReplayVotes,
  hasReplayVotes,
  hasBothTeamsVoted,
  activeGroups
} = require('./utils/replayManager');

// 👥 אימות, אנטי-ספאם ודיבור חכם
const { startFifoWarzoneAnnouncer } = require('./handlers/fifoWarzoneAnnouncer');
const { setupVerificationMessage, startDmTracking, handleInteraction: handleVerifyInteraction } = require('./handlers/verificationButton');
const { handleSpam } = require('./handlers/antispam');
const smartChat = require('./handlers/smartChat');

// 👤 נוכחות וזיהוי
const { trackGamePresence, hardSyncPresenceOnReady, startPresenceLoop } = require('./handlers/presenceTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const welcomeImage = require('./handlers/welcomeImage');

// 🧹 תחזוקה תקופתית
const { startCleanupScheduler } = require('./handlers/channelCleaner');

// 🪅 מערכת ימי הולדת
const handleBirthdayPanel = require('./handlers/birthdayPanelHandler');
const { startBirthdayTracker } = require('./handlers/birthdayTracker');
const { startWeeklyBirthdayReminder } = require('./handlers/weeklyBirthdayReminder');

// 🧠 עזרה / כפתורים
const { handleButton: helpHandleButton } = require('./commands/help');
const { handleMemberButtons } = require('./commands/memberButtons');

// 🔊 מוזיקה וסאונד
const { autocomplete: songAutocomplete } = require('./commands/song');
const handleMusicControls = require('./handlers/musicControls');

// 🛡️ אימות
const { startInactivityReminder } = require('./handlers/inactivityReminder');

// 📡 טלגרם
require('./shimonTelegram');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});
client.db = db;

// 🧠 טעינת Slash Commands (Map)
const commandMap = new Map();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if (command?.data?.name && typeof command.execute === 'function') {
    commandMap.set(command.data.name, command);
  }
}

client.once('ready', async () => {
  await hardSyncPresenceOnReady(client);
  await setupVerificationMessage(client);
  await registerSlashCommands(client.user.id, client); // רישום Slash מול Discord
  await startMvpReactionWatcher(client, db);

  startFifoWarzoneAnnouncer(client);
  startStatsUpdater(client);
  welcomeImage(client);
  startInactivityReminder(client);
  startDmTracking(client);
  startLeaderboardUpdater(client);
  startPresenceLoop(client);
  startPresenceRotation(client);
  startBirthdayTracker(client);
  startWeeklyBirthdayReminder(client);
  startCleanupScheduler(client);
  startMvpScheduler(client, db);

  console.log(` הבוט באוויר! ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
  const ref = db.collection('memberTracking').doc(member.id);
  const existing = await ref.get();

  if (!existing.exists) {
    await ref.set({
      guildId: member.guild.id,
      joinedAt: new Date().toISOString(),
      status: 'active',
      dmSent: false,
      replied: false,
      dmFailed: false,
      activityWeight: 0,
      reminderCount: 0,
      isInactive: false,
      inactivityLevel: 0
    });
  }

  try {
    await member.send(
      'במידה והסתבכת — פשוט לחץ על הלינק הבא:\n\n' +
      'https://discord.com/channels/583574396686434304/1120791404583587971\n\n' +
      'זה יוביל אותך ישירות לאימות וכניסה מלאה לשרת 👋'
    );
    console.log(`📩 נשלח DM הצטרפות ל־${member.user.tag}`);
  } catch (err) {
    console.warn(`⚠️ לא ניתן לשלוח DM ל־${member.user.tag}: ${err.message}`);
  }
});

client.on('guildMemberRemove', async member => {
  await db.collection('memberTracking').doc(member.id).set({
    status: 'left',
    leftAt: new Date().toISOString()
  }, { merge: true });

  console.log(`👋 ${member.user.tag} עזב – עודכן במעקב`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
  trackGamePresence(newPresence);
});

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

client.on('messageCreate', async message => {
  if (message.author.bot) return;
    // 📩 הודעה פרטית ל־DM
  if (!message.guild) {
    const GUILD_ID = process.env.GUILD_ID;
    const STAFF_CHANNEL_ID = '123456789012345678'; // ⬅️ עדכן את זה!

    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild?.members.fetch(message.author.id).catch(() => null);

    // שליחת לוג לצוות
    const staffChannel = client.channels.cache.get(STAFF_CHANNEL_ID);
    if (staffChannel?.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setTitle('📩 הודעת DM לבוט')
        .addFields(
          { name: 'משתמש', value: `<@${message.author.id}> (${message.author.tag})`, inline: false },
          { name: 'תוכן', value: message.content || '*הודעה ריקה*', inline: false },
          { name: 'סטטוס', value: member ? '✅ נמצא בשרת' : '❌ לא חבר בשרת', inline: true }
        )
        .setTimestamp()
        .setColor(member ? 0x00cc99 : 0xff6666);
      staffChannel.send({ embeds: [logEmbed] });
    }

    // אם המשתמש כבר חבר בשרת — מתנהג רגיל
    if (member) {
      await statTracker.trackMessage(message);
      await handleXPMessage(message);

      const lowered = message.content.toLowerCase();
      const targetBot = lowered.includes('שמעון') || lowered.includes('bot') || lowered.includes('shim');
      const curseWords = require('./handlers/antispam').allCurseWords;
      const hasCurse = curseWords.some(w => lowered.includes(w));
      if (targetBot && hasCurse) return smartChat(message);

      await handleSpam(message);
      return smartChat(message);
    }

    // 🧲 משתמש לא בשרת – מקבל הזמנה
    const inviteUrl = 'https://discord.gg/2DGAwxDtKW'; // ⬅️ עדכן לפי הצורך

    const embed = new EmbedBuilder()
      .setTitle('🎮 Gamers United IL')
      .setDescription(
        'נראה שאתה לא נמצא כרגע בקהילת **Gamers United IL**.\n\n' +
        'כדי להצטרף, לחץ על הכפתור למטה וגש לערוץ האימות לקבלת גישה מלאה.'
      )
      .setColor(0x5865f2)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/5968/5968756.png')
      .setFooter({ text: 'מחכים לך בקהילה 💬' });

    const button = new ButtonBuilder()
      .setLabel('⏎ הצטרף לשרת')
      .setStyle(ButtonStyle.Link)
      .setURL(inviteUrl);

    const row = new ActionRowBuilder().addComponents(button);

    return message.reply({ embeds: [embed], components: [row] });
  }

  // ✉️ הודעה רגילה בתוך שרת
  await statTracker.trackMessage(message);
  await handleXPMessage(message);

  const lowered = message.content.toLowerCase();
  const targetBot = lowered.includes('שמעון') || lowered.includes('bot') || lowered.includes('shim');
  const curseWords = require('./handlers/antispam').allCurseWords;
  const hasCurse = curseWords.some(w => lowered.includes(w));
  if (targetBot && hasCurse) {
    return smartChat(message);
  }

  await handleSpam(message);
  await smartChat(message);
});

// -------- אינטראקציות ---------
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) return songAutocomplete(interaction);

  // 🆘 כפתורי עזרה
  if (
    (interaction.isButton() && interaction.customId && interaction.customId.startsWith('help_')) ||
    (interaction.type === 5 && interaction.customId === 'help_ai_modal')
  ) {
    if (await helpHandleButton(interaction)) return;
  }

  // 🔘 כפתורים רגילים
  if (interaction.isButton()) {
    const id = interaction.customId;

    const isMemberButton = [
      'send_dm_batch_list',
      'send_dm_batch_final_check',
      'show_failed_list',
      'show_replied_list',
      'kick_failed_users'
    ].includes(id) || id.startsWith('send_dm_again_') || id.startsWith('send_final_dm_');
    if (isMemberButton) return handleMemberButtons(interaction, client);

    if (['pause', 'resume', 'stop'].includes(id)) {
      return handleMusicControls(interaction);
    }

    if (
      [
        'bday_list',
        'bday_next',
        'bday_add',
        'bday_missing',
        'bday_remind_missing'
      ].includes(id)
    ) {
      return handleBirthdayPanel(interaction);
    }

    if (id.startsWith('vote_') || id === 'show_stats') {
      return handleRSVP(interaction, client);
    }

    if (id.startsWith('replay_')) {
      const teamName = id.replace('replay_', '').replace('_', ' ');
      const voteResult = registerReplayVote(teamName, interaction.user.id);

      if (!voteResult) return interaction.reply({ content: '⚠️ שגיאה פנימית בריפליי.', ephemeral: true });

      await interaction.reply({ content: '💬 ההצבעה שלך נרשמה.', ephemeral: true });

      if (voteResult.allVoted) {
        const opponentGroup = [...activeGroups.entries()].find(([name]) => name !== teamName);
        if (opponentGroup) {
          const [_, opponentData] = opponentGroup;
          const voiceChannel = interaction.guild.channels.cache.get(opponentData.channelId);
          if (voiceChannel) {
            await playTTSInVoiceChannel(
              voiceChannel,
              `שחקני ${teamName} רוצים ריפליי. מה דעתכם ${opponentData.name}?`
            );
          }
        }
      }

      if (hasReplayVotes(teamName) && hasBothTeamsVoted()) {
        await executeReplayReset(interaction.guild, interaction.channel, teamName);
      }
      return;
    }

    if (id === 'repartition_now') {
      const FIFO_CHANNEL_ID = '123456789012345678'; // עדכן לפי הצורך
      const FIFO_CATEGORY_ID = process.env.FIFO_CATEGORY_ID;
      const DEFAULT_GROUP_SIZE = 3;

      const voiceChannel = interaction.guild.channels.cache.get(FIFO_CHANNEL_ID);
      if (!voiceChannel?.isVoiceBased()) return;

      const members = voiceChannel.members.filter(m => !m.user.bot);
      if (members.size < 2) {
        return await interaction.reply({ content: '⛔ אין מספיק שחקנים.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const { groups, waiting, channels } = await createGroupsAndChannels({
        interaction,
        members: [...members.values()],
        groupSize: DEFAULT_GROUP_SIZE,
        categoryId: FIFO_CATEGORY_ID,
        openChannels: true
      });

      const summaryEmbed = new EmbedBuilder()
        .setTitle('📢 בוצעה חלוקה מחדש!')
        .setColor(0x00ff88)
        .setTimestamp();

      groups.forEach((group, i) => {
        const name = `TEAM ${String.fromCharCode(65 + i)}`;
        summaryEmbed.addFields({
          name,
          value: group.map(m => m.displayName).join(', '),
          inline: false
        });

        const ch = channels[i];
        if (ch) startGroupTracking(ch, group.map(m => m.id), name);
      });

      if (waiting.length > 0) {
        summaryEmbed.addFields({
          name: '⏳ ממתינים',
          value: waiting.map(m => m.displayName).join(', '),
          inline: false
        });
      }

      await interaction.editReply({ content: '✅ החלוקה מחדש בוצעה!', embeds: [summaryEmbed] });
      resetReplayVotes();
      return;
    }

    return handleVerifyInteraction(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
    return handleBirthdayPanel(interaction);
  }

  if (!interaction.isCommand()) return;
  await statTracker.trackSlash(interaction);

  // 🧠 הפעלת פקודות Slash
  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`❌ שגיאה בביצוע Slash "${interaction.commandName}":`, err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ שגיאה בביצוע הפקודה.', ephemeral: true });
    }
  }
});

// 🚀 הפעלת הבוט
client.login(process.env.DISCORD_TOKEN);
require('./shimonTelegram');
setInterval(() => {}, 1000 * 60 * 60);
