// ==============================
// 🔥 התחברות ל-Firestore
// ==============================
const admin = require("firebase-admin");

const serviceAccountString = process.env.FIREBASE_CREDENTIAL;
if (!serviceAccountString) {
  console.error("❌ לא הוגדר FIREBASE_CREDENTIAL");
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
// 🤖 Discord Bot – עם Azure TTS משודרג
// ==============================
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
} = require("@discordjs/voice");
const axios = require("axios");
const { Readable } = require("stream");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`שימי הבוט באוויר! ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

// ==============================
// 🔊 TTS עם חילה הסרקסטית 👑
// ==============================
client.on("voiceStateUpdate", async (oldState, newState) => {
  const joinedChannel = newState.channelId;
  const leftChannel = oldState.channelId;
  const TEST_CHANNEL = process.env.TTS_TEST_CHANNEL_ID;

  console.log(`🎯 בדיקה: joined=${joinedChannel}, expected=${TEST_CHANNEL}`);

  if (joinedChannel === TEST_CHANNEL && leftChannel !== TEST_CHANNEL) {
    try {
      console.log("✅ תנאי הופעל – מתחילים השמעה");

      const channel = newState.guild.channels.cache.get(TEST_CHANNEL);
      const members = channel.members.filter((m) => !m.user.bot);
      if (members.size < 1) return;

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 5_000);

      const text = getRandomFunnySSML();

      const audioBuffer = await synthesizeAzureTTS(text);
      const stream = Readable.from(audioBuffer);

      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
      });

      const player = createAudioPlayer();
      connection.subscribe(player);
      player.play(resource);

      player.once(AudioPlayerStatus.Idle, () => {
        connection.destroy();
        console.log("👋 הבוט סיים והשאיר רושם");
      });
    } catch (err) {
      console.error("❌ שגיאה בתהליך ההשמעה:", err);
    }
  }
});

// ==============================
// 🧠 דיבור עם סטייל – SSML מגניב
// ==============================
function getRandomFunnySSML() {
  const phrases = [
    "היי שם! <break time='300ms'/> כן, אתה. <break time='500ms'/> תתנהג בהתאם.",
    "שימי הבוט כאן <break time='200ms'/> ואני לא רואה אתכם צוחקים. תתעוררו!",
    "ברוכים הבאים לערוץ. <break time='400ms'/> תזכרו – מי שמפריע, מקבל השתקה אוטומטית מהיקום.",
    "אני שומעת פה יותר שקט <break time='300ms'/> מאשר בשיעור מתמטיקה ביום שישי.",
    "אם לא תצחקו תוך 3 שניות, <break time='300ms'/> אני מתחילה לשיר בעצמי.",
    "אני כאן כדי לבדוק סאונד <break time='300ms'/> ולחלק הערות סרקסטיות. מוכנים?"
  ];

  const chosen = phrases[Math.floor(Math.random() * phrases.length)];

  return `
    <speak version='1.0' xml:lang='he-IL'>
      <voice xml:lang='he-IL' xml:gender='Female' name='he-IL-HilaNeural'>
        <prosody rate="medium" pitch="+15%">
          ${chosen}
        </prosody>
      </voice>
    </speak>
  `;
}

// ==============================
// 🔁 דיבור אמיתי דרך Azure
// ==============================
async function synthesizeAzureTTS(ssml) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const response = await axios.post(endpoint, ssml, {
    responseType: "arraybuffer",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
      "User-Agent": "discord-bot",
    },
  });

  return response.data;
}
