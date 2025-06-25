// 📁 index.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

// 🔗 בסיס נתונים ועזרי מערכת
const { registerSlashCommands } = require('./utils/commandsLoader');
const db = require('./utils/firebase');

// 🧠 ניתוח / סטטיסטיקות / XP
const { generateWeeklyReport } = require('./utils/weeklyInactivityReport');
const statTracker = require('./handlers/statTracker');
const { handleXPMessage } = require('./handlers/engagementManager');
const { startStatsUpdater } = require('./handlers/statsUpdater');

// 🏆 MVP ו־Reactions
const { startMvpScheduler } = require('./handlers/mvpTracker');
const { startMvpReactionWatcher } = require('./handlers/mvpReactions');

// 📊 לוחות ומעקב
const { startLeaderboardUpdater } = require('./handlers/leaderboardUpdater');

// 🧑‍🤝‍🧑 Replay ופיפו
const { handleFifoButtons } = require('./handlers/fifoButtonHandler');

// 👥 אימות, אנטי-ספאם ודיבור חכם
const { startFifoWarzoneAnnouncer } = require('./handlers/fifoWarzoneAnnouncer');
const { setupVerificationMessage, startDmTracking, handleInteraction: handleVerifyInteraction } = require('./handlers/verificationButton');
const { handleSpam } = require('./handlers/antispam');
const smartChat = require('./handlers/smartChat');

// 👤 נוכחות וזיהוי
const { scanForConsoleAndVerify } = require('./handlers/verificationButton');
const { trackGamePresence, hardSyncPresenceOnReady, startPresenceLoop } = require('./handlers/presenceTracker');
const { startPresenceRotation } = require('./handlers/presenceRotator');
const { handleVoiceStateUpdate } = require('./handlers/voiceHandler');
const welcomeImage = require('./handlers/welcomeImage');

// 🧹 תחזוקה תקופתית
const { startCleanupScheduler } = require('./handlers/channelCleaner');

// 🪅 מערכת ימי הולדת
const { startBirthdayCongratulator } = require('./handlers/birthdayCongratulator');
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
 partials: ['CHANNEL', 'MESSAGE', 'USER'] // ← זו התוספת שחסרה!

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

  startBirthdayCongratulator(client);
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

  // ← כאן תכניס את שורת הסריקה:
  setTimeout(() => scanForConsoleAndVerify(member), 30000); // סריקה אחרי 30 שניות
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

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const isDM = !message.guild;
  if (isDM) {
    try {
      const inviteUrl = 'https://discord.gg/2DGAwxDtKW'; // הקישור הקבוע לשרת שלך

      const embed = new EmbedBuilder()
        .setTitle('📭 שמעון לא מגיב בפרטי')
        .setDescription([
          'היי 👋',
          'נראה שניסית לשלוח הודעה פרטית לשמעון.',
          '',
          '⚠️ הוא לא מגיב ל־DMים רגילים.',
          '📢 כדי לדבר עם שמעון, הצטרף אלינו לשרת 👇'
        ].join('\n'))
        .setThumbnail('attachment://logo.png')
        .setColor(0x5865f2)
        .setFooter({ text: 'Gamers United IL - קהילת הגיימרים של ישראל 🎮' })
        .setTimestamp();

      const button = new ButtonBuilder()
        .setLabel('⏎ הצטרף לשרת')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl);

      const row = new ActionRowBuilder().addComponents(button);

      await message.reply({
        embeds: [embed],
        components: [row],
        files: [{
          attachment: './assets/logo.png',
          name: 'logo.png'
        }]
      });
    } catch (err) {
      console.warn('❌ לא ניתן היה להשיב ב־DM:', err.message);
    }
    return;
  }

  // הודעות בתוך שרת
  await statTracker.trackMessage(message);
  await handleXPMessage(message);

  const lowered = message.content.toLowerCase();
  const targetBot = lowered.includes('שמעון') || lowered.includes('bot') || lowered.includes('shim');
  const curseWords = require('./handlers/antispam').allCurseWords;
  const hasCurse = curseWords.some(w => lowered.includes(w));
  if (targetBot && hasCurse) return smartChat(message);

  await handleSpam(message);
  await smartChat(message);
});

client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) return songAutocomplete(interaction);

  // 🆘 כפתורי עזרה
  if (
    (interaction.isButton() && interaction.customId?.startsWith('help_')) ||
    (interaction.type === 5 && interaction.customId === 'help_ai_modal')
  ) {
    if (await helpHandleButton(interaction)) return;
  }

  // 🔘 כפתורי fallback ל־DM
  if (interaction.isButton() && interaction.customId === 'dm_fallback_reply') {
    const { showDmFallbackModal } = require('./handlers/dmFallbackModal');
    return showDmFallbackModal(interaction);
  }

  // 📝 שליחת תגובה ב־modal
  if (interaction.isModalSubmit() && interaction.customId === 'dm_fallback_modal') {
    const { handleDmFallbackModalSubmit } = require('./handlers/dmFallbackModal');
    return handleDmFallbackModalSubmit(interaction, client);
  }

  // 🔘 כפתורים אחרים
  if (interaction.isButton()) {
    const id = interaction.customId;

    // 🎮 כפתורי FIFO (פיפו)
    if (id.startsWith('replay_') || id.startsWith('reset_all_') || id === 'repartition_now') {
      
      return handleFifoButtons(interaction, client);
    }

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

    return handleVerifyInteraction(interaction);
  }

  // 📝 מודאלים נוספים
  if (interaction.isModalSubmit() && interaction.customId === 'birthday_modal') {
    return handleBirthdayPanel(interaction);
  }

  // 🧠 פקודות סלאש
  if (!interaction.isCommand()) return;
  await statTracker.trackSlash(interaction);

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
setInterval(() => {
  const now = new Date();
  const israelTime = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60000);
  const hour = israelTime.getHours();
  const day = israelTime.getDay(); // 0 = ראשון, 4 = חמישי

  if (day === 4 && hour === 18) {
    generateWeeklyReport(client);
  }
}, 60 * 60 * 1000); // בדיקה כל שעה

