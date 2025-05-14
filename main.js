// ==============================
// 🔥 התחברות ל-Firestore
// ==============================
const admin = require("firebase-admin");

const serviceAccountString = process.env.FIREBASE_CREDENTIAL;

if (!serviceAccountString) {
  console.error("❌ לא הוגדר משתנה סביבה FIREBASE_CREDENTIAL");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountString);
} catch (err) {
  console.error("❌ שגיאה בפענוח JSON:", err);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function testConnection() {
  try {
    await db.collection("test").doc("ping").set({
      message: "Firestore מחובר!",
      time: new Date().toISOString(),
    });
    console.log("✅ Firestore מחובר בהצלחה!");
  } catch (err) {
    console.error("❌ שגיאה ב-Firestore:", err);
  }
}
testConnection();

// ==============================
// 🤖 Discord Bot (discord.js v14)
// ==============================
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus
} = require('@discordjs/voice');

const googleTTS = require('google-tts-api');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
});

client.once('ready', () => {
  console.log(`שימי הבוט באוויר! ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

// ==============================
// 🔊 TTS אוטומטי בעת כניסה לערוץ קול מסוים
// ==============================

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const joinedChannel = newState.channelId;
    const leftChannel = oldState.channelId;
    const TEST_CHANNEL = process.env.TTS_TEST_CHANNEL_ID;

    if (joinedChannel === TEST_CHANNEL && leftChannel !== TEST_CHANNEL) {
      const channel = newState.guild.channels.cache.get(TEST_CHANNEL);
      const members = channel.members.filter(m => !m.user.bot);
      if (members.size < 1) return;

      console.log('🎤 הבוט מצטרף לערוץ');

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 5000);

      const sentences = [
        "יאללה חברים, תתנהגו בהתאם, יש כאן בוט עם חוש הומור.",
        "אני רק בודק סאונד, תמשיכו לדבר כאילו כלום לא קרה.",
        "שימי הבוט הגיע, נא לא לרייר.",
        "אני שומע פה יותר שתיקות מאשר בקבוצת ווטסאפ של קרובי משפחה."
      ];
      const chosen = sentences[Math.floor(Math.random() * sentences.length)];

      const url = googleTTS.getAudioUrl(chosen, {
        lang: 'he',
        slow: false,
        host: 'https://translate.google.com',
      });

      const resource = createAudioResource(url);
      const player = createAudioPlayer();

      connection.subscribe(player);
      player.play(resource);

      player.once(AudioPlayerStatus.Idle, () => {
        connection.destroy();
        console.log("👋 הבוט סיים והשאיר רושם");
      });
    }
  } catch (err) {
    console.error("❌ שגיאה בתהליך השמעת הקול:", err);
  }
});
