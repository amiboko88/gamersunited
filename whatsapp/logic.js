// ✅ הגדרות בסיס
const ADMIN_NUMBER = '100772834480319'; 
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');
const db = require('../utils/firebase');
const admin = require('firebase-admin');

// ✅ ייבוא המודולים
const { handleShimonRoulette } = require('./handlers/rouletteHandler');
// getUserFullProfile - הפונקציה הזו אחראית על המיפוי בין טלפון לדיסקורד ID
const { getUserFullProfile, addFact, checkDailyVoiceLimit, incrementVoiceUsage, incrementTotalMessages } = require('./handlers/profileHandler');
const { handleImageAnalysis, shouldCheckImage } = require('./handlers/visionHandler');
const { placeBet, isSessionActive } = require('./handlers/casinoHandler');
// זה משתמש ב-ElevenLabs (כמו שהיה מוגדר אצלך במקור)
const { generateVoiceNote } = require('./handlers/voiceHandler'); 
const { generateProfileCard } = require('./handlers/profileRenderer');
const { isSystemActive } = require('./utils/timeHandler'); 
const { generateSystemPrompt } = require('./persona'); 

// ✅ טעינת פרופילים אישיים (מהנתיב הנכון: data/profiles.js)
let userPersonalities = {};
try {
    const profilesPath = path.join(__dirname, '/../data/profiles.js'); 
    if (fs.existsSync(profilesPath)) {
        const loaded = require(profilesPath);
        userPersonalities = loaded.playerProfiles || loaded;
        log(`[Logic] ✅ Loaded profiles for ${Object.keys(userPersonalities).length} users.`);
    } else {
        log(`[Logic] ⚠️ Profiles file not found at: ${profilesPath}`);
    }
} catch (e) { console.error("Could not load profiles.js", e); }

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// מעקבים
const conversationHistory = new Map();
const lastInteractionTime = new Map();

// --- 🤬 טריגרים ---
const TRIGGER_CURSES = [
    'סתום', 'אפס', 'מניאק', 'שרמוטה', 'הומו', 'קוקסינל', 'זדיין', 'זין', 'חופר', 
    'שתוק', 'טמבל', 'זבל', 'כלב', 'בן זונה', 'דבע', 'אהבל', 'מפגר', 'אידיוט', 
    'כוסעמק', 'שמן', 'מכוער', 'חלאס', 'סע סע', 'תנוח', 'ילד כאפות', 'בוט מסריח'
];

const TRIGGER_BET = [
    'שים', 'להמר', 'הימור', 'bet', 'שם', 'משים', 'נכנס', 'אול אין', 'all in', 'זורק', 'הימורים'
]; 

const TRIGGER_PROFILE = [
    'פרופיל', 'כרטיס', 'סטטוס', 'מי אני', 'דרגה', 'כמה כסף', 'הארנק שלי', 'כמה xp', 'מצב חשבון', 'נתונים'
];

const NICE_WORDS = [
    'תודה', 'אלוף', 'עזרת', 'מלך', 'גבר', 'מעריך', 'אח יקר', 'שיחקת אותה', 
    'גדול', 'אוהב אותך', 'נסיך', 'חזק', 'תותח', 'וואלה תודה'
];

// --- 😴 תגובות דינמיות לשעות מתות ---
const OFFLINE_RESPONSES = {
    Shabbat: [
        "שבת היום יא כופר. נדבר במוצ\"ש.",
        "אני שומר, נשמה. שחרר אותי עד הערב.",
        "אין מענה בשבת. לך לבית כנסת.",
        "שבת שלום. תנוח קצת מהמסך."
    ],
    Night: [
        "3 בלילה, אתה אמיתי? תן לישון.",
        "חלאס עם ההתראות, אנשים ישנים פה.",
        "אין קבלת קהל בשעות האלה. לילה טוב.",
        "מה אתה ער? לך לישון יא הזוי."
    ],
    Siesta: [
        "אני בשנ\"צ. דבר איתי ב-16:00.",
        "ששש... אסור להפריע בין 2 ל-4.",
        "הלכתי לאכול צהריים. תשאיר הודעה.",
        "עיניים נעצמות. נדבר אח\"כ."
    ]
};

function getRandomOfflineReply(reason) {
    const responses = OFFLINE_RESPONSES[reason] || ["לא זמין כרגע."];
    return responses[Math.floor(Math.random() * responses.length)];
}

// ✅ פונקציה חכמה לשליפת ירידות (לפי Discord ID מהדאטה בייס)
function getPersonalRoastData(senderName, discordId) {
    // עדיפות 1: זיהוי ודאי לפי ID מדיסקורד
    if (discordId && userPersonalities[discordId]) {
        // מחליף את הפלייסהולדר {userName} בשם האמיתי
        return userPersonalities[discordId].map(line => line.replace(/{userName}/g, senderName));
    }
    
    // עדיפות 2: חיפוש לפי שם (למשל "יוגי" בתוך השם בוואטסאפ)
    const nameKey = Object.keys(userPersonalities).find(key => senderName.toLowerCase().includes(key));
    if (nameKey) {
        return userPersonalities[nameKey].map(line => line.replace(/{userName}/g, senderName));
    }

    // ברירת מחדל: ירידות כלליות
    if (userPersonalities.default) {
        return userPersonalities.default.map(line => line.replace(/{userName}/g, senderName));
    }
    
    return [];
}

async function rewardKindness(senderId, text) {
    if (NICE_WORDS.some(w => text.includes(w)) && text.length > 5) {
        if (Math.random() < 0.25) { 
            try {
                await db.collection('whatsapp_users').doc(senderId).set({
                    xp: admin.firestore.FieldValue.increment(50) 
                }, { merge: true });
            } catch (e) {}
        }
    }
}

function cleanReply(text) {
    return text.replace(/^שמעון:\s*/, '').replace(/^Shimon:\s*/, '').replace(/"/g, '').trim();
}

// --- הלוגיקה הראשית ---
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid; 
    const isGroup = chatJid.endsWith('@g.us');
    const senderFullJid = isGroup ? (msg.key.participant || msg.participant) : chatJid;
    const senderId = senderFullJid ? senderFullJid.split('@')[0] : 'unknown';
    const senderName = msg.pushName || "פלוני";
    const lowerText = text.trim().toLowerCase();

    // 1. 🛑 בדיקת שעות פעילות
    const sysStatus = isSystemActive();
    if (!sysStatus.active) {
        const lastTime = lastInteractionTime.get(senderId) || 0;
        // עונה פעם ב-30 דקות למשתמש בשעות מתות, ורק אם תייגו
        if (Date.now() - lastTime > 30 * 60 * 1000) {
            if (lowerText.includes('@') || lowerText.includes('שמעון')) {
                const reply = getRandomOfflineReply(sysStatus.reason);
                await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
                lastInteractionTime.set(senderId, Date.now());
            }
        }
        return; 
    }

    incrementTotalMessages(senderId); 

    // 2. 🎡 רולטה רוסית
    if (lowerText.includes('רולטה') || lowerText.includes('roulette')) {
        const triggered = await handleShimonRoulette(sock, chatJid, senderId, senderName, isGroup, msg);
        if (triggered) return; 
    }

    // 3. 📸 Vision
    if (msg.message.imageMessage && shouldCheckImage(senderId, lowerText)) {
        await handleImageAnalysis(sock, msg, chatJid, senderId, senderName);
        return;
    }

    if (!text) return;

    // 4. 🎫 כרטיס פרופיל
    if (TRIGGER_PROFILE.some(t => lowerText.includes(t)) && lowerText.split(' ').length < 4) {
        await sock.sendPresenceUpdate('composing', chatJid);
        
        let avatarUrl;
        try { avatarUrl = await sock.profilePictureUrl(senderFullJid, 'image'); } catch { avatarUrl = null; }

        // שליפת נתונים מהירה (כולל קישור לדיסקורד)
        const waUserRef = await getUserFullProfile(senderId, senderName);
        const totalMessages = waUserRef.whatsappData?.totalMessages || 0; 
        
        // עדיפות ל-XP מהדיסקורד, אם לא קיים אז מהוואטסאפ
        const balance = waUserRef.discordData?.xp || waUserRef.whatsappData?.xp || 0;

        const cardPath = await generateProfileCard({
            name: senderName,
            avatarUrl: avatarUrl,
            messageCount: totalMessages,
            balance: balance
        });

        await sock.sendMessage(chatJid, { 
            image: fs.readFileSync(cardPath),
            caption: `💳 הכרטיס של **${senderName}**`
        }, { quoted: msg });

        try { fs.unlinkSync(cardPath); } catch (e) {}
        return;
    }

    // 5. 🎰 הימורים
    if (TRIGGER_BET.some(w => lowerText.includes(w)) && lowerText.includes('על')) {
        const betRes = await placeBet(senderId, senderName, lowerText);
        if (betRes) await sock.sendMessage(chatJid, { text: betRes }, { quoted: msg });
        return;
    }

    // --- 🤖 מנוע ה-AI ---

    const isReply = msg.message.extendedTextMessage?.contextInfo?.participant?.includes(sock.user.id.split(':')[0]);
    const isMention = lowerText.includes('@') && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.some(id => id.includes(sock.user.id.split(':')[0]));
    const isDirectQuestion = lowerText.startsWith('שמעון,'); 
    const isCurse = TRIGGER_CURSES.some(w => lowerText.includes(w)) && (lowerText.includes('שמעון') || isReply);
    
    // מניעת ספאם: עונה רק אם פנו אליו או קיללו אותו
    if (!isReply && !isMention && !isDirectQuestion && !isCurse) {
        await rewardKindness(senderId, lowerText); 
        return; 
    }

    await sock.sendPresenceUpdate('composing', chatJid);

    // ✅ שליפת ה"תיק האישי"
    const userProfile = await getUserFullProfile(senderId, senderName);
    // userProfile.discordId מגיע מהמיפוי שעשינו ב-profileHandler
    const personalRoasts = getPersonalRoastData(senderName, userProfile.discordId);
    
    const randomRoast = personalRoasts.length > 0 
        ? personalRoasts[Math.floor(Math.random() * personalRoasts.length)] 
        : "";

    // הקשר ל-AI
    const injectedContext = `
    [משתמש]: ${senderName}
    [חומר רקע עליו]: ${randomRoast}
    [סיטואציה]: ${isCurse ? "תקיפה מילולית. תגיב באגרסיביות." : "שיחה רגילה."}
    [הנחיה]: 6 מילים גג. בלי חפירות.
    [קזינו]: ${isSessionActive() ? "פתוח" : "סגור"}
    `;

    const history = conversationHistory.get(chatJid) || [];
    const contextString = history.map(h => `${h.name}: ${h.content}`).join("\n");

    const systemMsg = generateSystemPrompt(
        senderName,
        randomRoast, 
        contextString,
        injectedContext,
        "" 
    );

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemMsg }],
            max_tokens: 120, 
            temperature: 1.0 
        });

        let replyText = cleanReply(completion.choices[0].message.content);

        // שמירת עובדות חדשות
        const factMatch = replyText.match(/{{FACT:\s*(.*?)}}/);
        if (factMatch) {
            const newFact = factMatch[1];
            await addFact(senderId, newFact);
            log(`[BlackBook] 📓 Learned: ${newFact}`);
            replyText = replyText.replace(factMatch[0], "").trim();
        }

        // 🔊 לוגיקת וויס (ElevenLabs)
        const voiceChance = isCurse ? 0.95 : 0.05; 
        const canVoice = await checkDailyVoiceLimit(senderId);
        
        if (canVoice && Math.random() < voiceChance) {
            await sock.sendPresenceUpdate('recording', chatJid);
            
            // ✅ קריאה ל-VoiceHandler הקיים (ElevenLabs)
            // אנחנו לא מעבירים לו פרמטרים של OpenAI, הוא עובד עצמאית
            const audioBuffer = await generateVoiceNote(replyText); 
            
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mpeg', // הפתרון לאנדרואיד
                    ptt: false 
                }, { quoted: msg });
                
                await incrementVoiceUsage(senderId);
            } else {
                await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
            }
        } else {
            await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        }

        // עדכון היסטוריה
        history.push({ name: senderName, content: text });
        history.push({ name: 'שמעון', content: replyText });
        if (history.length > 8) history.shift();
        conversationHistory.set(chatJid, history);

    } catch (e) {
        log(`Error in logic: ${e.message}`);
    }
}

module.exports = { handleMessageLogic };