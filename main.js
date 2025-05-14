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

client.on('voiceStateUpdate', (oldState, newState) => {
    console.log("🎯 voiceStateUpdate פועל");
  
    console.log("old:", {
      channelId: oldState.channelId,
      user: oldState.member?.user.tag
    });
  
    console.log("new:", {
      channelId: newState.channelId,
      user: newState.member?.user.tag
    });
  });
  
  
