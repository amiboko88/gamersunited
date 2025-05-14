// ==============================
// 📦 התחברות ל-Firestore
// ==============================
const admin = require("firebase-admin");

const serviceAccountString = process.env.FIREBASE_CREDENTIAL;

if (!serviceAccountString) {
  console.error("❌ לא הוגדר משתנה סביבה FIREBASE_SERVICE_ACCOUNT");
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

// בדיקת התחברות (רק לצורך בדיקה)
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
// 🤖 בוט דיסקורד – ללא שינוי!
// ==============================

require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');

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





client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      const joinedChannel = newState.channelId;
      const leftChannel = oldState.channelId;
  
      const TEST_CHANNEL = process.env.TTS_TEST_CHANNEL_ID;
  
      // רק אם נכנס לערוץ הייעודי
      if (joinedChannel === TEST_CHANNEL && leftChannel !== TEST_CHANNEL) {
        const channel = newState.guild.channels.cache.get(TEST_CHANNEL);
  
        // נוודא שיש לפחות 1 או 2 משתמשים
        const members = channel.members.filter(m => !m.user.bot);
        if (members.size < 1) return;
  
        // הבוט מצטרף
        const connection = await channel.join(); // אם אתה ב-Discord.js v13, אחרת נעשה דרך Voice
        console.log('🎤 הצטרפתי לערוץ בדיקה');
  
        // השמעת TTS הומוריסטי
        const sentences = [
          "יאללה חברים, תתנהגו בהתאם, יש כאן בוט עם חוש הומור.",
          "אני רק בודק סאונד, תמשיכו לדבר כאילו כלום לא קרה.",
          "שימי הבוט הגיע, נא לא לרייר.",
          "אני שומע פה יותר שתיקות מאשר בקבוצת ווטסאפ של קרובי משפחה.",
        ];
        const chosen = sentences[Math.floor(Math.random() * sentences.length)];
  
        // Text-to-Speech: נשתמש ב־gTTS או מערכת קול אחרת (מוכן להוספה לפי בחירה)
  
        // כאן נכניס השמעה בפועל (או נשאיר כתשובת טקסט להמשך)
  
        // יציאה אחרי כמה שניות
        setTimeout(() => {
          connection.disconnect();
          console.log("👋 הבוט יצא מהערוץ");
        }, 5000);
      }
    } catch (err) {
      console.error("❌ שגיאה ב-TTS:", err);
    }
  });
  