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
const { getUserFullProfile, addFact, checkDailyVoiceLimit, incrementVoiceUsage, incrementTotalMessages } = require('./handlers/profileHandler');
const { handleImageAnalysis, shouldCheckImage } = require('./handlers/visionHandler');
const { placeBet, isSessionActive } = require('./handlers/casinoHandler');
const { generateVoiceNote } = require('./handlers/voiceHandler'); 
const { generateProfileCard } = require('./handlers/profileRenderer');
const { isSystemActive } = require('./utils/timeHandler'); 
const { generateSystemPrompt } = require('./persona'); 

// ✅ טעינת פרופילים (נתיב מתוקן: whatsapp -> root -> data)
let userPersonalities = {};
try {
    const profilesPath = path.join(__dirname, '../data/profiles.js'); 
    if (fs.existsSync(profilesPath)) {
        const loaded = require(profilesPath);
        userPersonalities = loaded.playerProfiles || loaded;
        log(`[Logic] ✅ Loaded profiles for ${Object.keys(userPersonalities).length} users.`);
    }
} catch (e) { console.error("Could not load profiles.js", e); }

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const conversationHistory = new Map();
const lastInteractionTime = new Map();

// --- 🤬 טריגרים ---
const TRIGGER_CURSES = [
    'סתום', 'אפס', 'מניאק', 'שרמוטה', 'הומו', 'קוקסינל', 'זדיין', 'זין', 'חופר', 
    'שתוק', 'טמבל', 'זבל', 'כלב', 'בן זונה', 'דבע', 'אהבל', 'מפגר', 'אידיוט', 
    'כוסעמק', 'שמן', 'מכוער', 'חלאס', 'סע סע', 'תנוח', 'ילד כאפות', 'בוט מסריח'
];

// 🔥 רשימת טריגרים מורחבת להימורים
const TRIGGER_BET = [
    'שים', 'להמר', 'הימור', 'bet', 'שם', 'משים', 'נכנס', 'אול אין', 'all in', 
    'זורק', 'הימורים', 'טופס', 'ווינר', 'מניח', 'שם כסף', 'מהמר'
]; 

const TRIGGER_PROFILE = [
    'פרופיל', 'כרטיס', 'סטטוס', 'מי אני', 'דרגה', 'כמה כסף', 'הארנק שלי', 'כמה xp', 'מצב חשבון', 'נתונים'
];

const NICE_WORDS = [
    'תודה', 'אלוף', 'עזרת', 'מלך', 'גבר', 'מעריך', 'אח יקר', 'שיחקת אותה', 
    'גדול', 'אוהב אותך', 'נסיך', 'חזק', 'תותח', 'וואלה תודה'
];

// --- 😴 תגובות דינמיות לשעות מתות (מורחב V2) ---
const OFFLINE_RESPONSES = {
    Shabbat: [
        "שבת היום יא כופר. נדבר במוצ\"ש.",
        "אני שומר, נשמה. שחרר אותי עד הערב.",
        "אין מענה בשבת. לך לבית כנסת תגיד קדיש.",
        "שבת שלום. תנוח קצת מהמסך, העיניים שלך נראות כמו עגבניה.",
        "גוי. פשוט גוי. שלח הודעה במוצ\"ש.",
        "בורא פרי הגפן... אה רגע, אתה מפריע לי בקידוש. עוף מפה.",
        "הבוט נח. השם ישמור אותך (כי אני לא אשמור עליך עכשיו).",
        "אסור להדליק אש, ואסור לחפור לשמעון בשבת.",
        "תגיד, אין לך איזה צ'ולנט לאכול? שחרר אותי.",
        "מצב שבת: מופעל. מצב עצבים על חילונים: גם מופעל.",
        "ששש... המלאכים ישנים. וגם אני."
    ],
    Night: [
        "3 בלילה, אתה אמיתי? לך לישון יא ינשוף.",
        "חלאס עם ההתראות, אנשים (ובוטים) ישנים פה!",
        "אין קבלת קהל בשעות האלה. לילה טוב.",
        "מה אתה ער? גנבו לך את השמיכה?",
        "תגיד לי, אתה לא עובד מחר? יאללה למיטה.",
        "זזז... 😴 (שמעון חולם על זכייה בלוטו, אל תפריע)",
        "הודעה זו נשלחה לפח הזבל כי שמעון ישן. נסה שוב בבוקר.",
        "אחי, העיניים שלי נעצמות. דבר איתי אחרי הקפה של הבוקר.",
        "אם זה לא זכייה במיליון שקל, זה לא מעניין אותי בשעה כזאת.",
        "כיבוי אורות. נתראה מחר.",
        "אתה יודע מה השעה? כי אני לא, אני ישן."
    ],
    Siesta: [
        "אני בשנ\"צ. דבר איתי ב-16:00.",
        "ששש... אסור להפריע בין 2 ל-4. חוק מדינה.",
        "הלכתי לאכול צהריים (שווארמה). תשאיר הודעה.",
        "עיניים נעצמות... המערכת בטעינה.",
        "לא עונה. אני במאוזן.",
        "בין שתיים לארבע גם אלוהים נח. תלמד ממנו.",
        "אני בחלום עכשיו, אל תעיר אותי.",
        "הפסקה. תחזור עוד שעתיים.",
        "משנ\"צ בכיף שלי. אל תהרוס.",
        "רק דחוף? יופי, אז זה יחכה ל-16:00.",
        "זמן מנוחה. נא לא להאכיל את הבוט."
    ]
};

function getRandomOfflineReply(reason) {
    const responses = OFFLINE_RESPONSES[reason] || ["לא זמין כרגע."];
    return responses[Math.floor(Math.random() * responses.length)];
}

function getPersonalRoastData(senderName, discordId) {
    if (discordId && userPersonalities[discordId]) {
        return userPersonalities[discordId].map(line => line.replace(/{userName}/g, senderName));
    }
    const nameKey = Object.keys(userPersonalities).find(key => senderName.toLowerCase().includes(key));
    if (nameKey) {
        return userPersonalities[nameKey].map(line => line.replace(/{userName}/g, senderName));
    }
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

    // 1. שעות פעילות
    const sysStatus = isSystemActive();
    if (!sysStatus.active) {
        const lastTime = lastInteractionTime.get(senderId) || 0;
        if (Date.now() - lastTime > 30 * 60 * 1000) {
            if (lowerText.includes('@') || lowerText.includes('שמעון')) {
                const reply = getRandomOfflineReply(sysStatus.reason);
                await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
                lastInteractionTime.set(senderId, Date.now());
            }
        }
        return; 
    }

    // 🔥 עדכון סטטיסטיקות + בדיקת עליית רמה (הפיצ'ר החדש) 🔥
    const levelData = await incrementTotalMessages(senderId);
    
    if (levelData && levelData.leveledUp) {
        // --- חגיגת עליית רמה ---
        await sock.sendPresenceUpdate('composing', chatJid);

        // משיכת פרופיל עדכני (כדי לדעת כמה כסף יש אחרי הבונוס)
        const updatedProfile = await getUserFullProfile(senderId, senderName);
        const balance = updatedProfile.discordData?.xp || updatedProfile.whatsappData?.xp || 0;

        // יצירת כרטיס חגיגי
        const cardPath = await generateProfileCard({
            name: senderName,
            avatarUrl: await sock.profilePictureUrl(senderFullJid, 'image').catch(() => null),
            messageCount: levelData.totalMessages,
            balance: balance
        });

        // יצירת ברכה אישית מה-AI
        let congratsText = "מזל טוב.";
        try {
            const congratsCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{
                    role: "system",
                    content: `
                    אתה שמעון. המשתמש ${senderName} עלה לדרגת "${levelData.rankName}".
                    הוא קיבל מענק של ${levelData.reward} שקל.
                    תברך אותו בציניות/קשוח. דוגמה: "הפסקת להיות בוט." או "אל תבזבז את זה על שטויות."
                    `
                }],
                max_tokens: 60
            });
            congratsText = cleanReply(congratsCompletion.choices[0].message.content);
        } catch(e) {}

        const caption = `🆙 **LEVEL UP!**\n` +
                        `מזל טוב @${senderId}!\n` +
                        `דרגה חדשה: **${levelData.rankName}** 🎖️\n` +
                        `בונוס כספי: **₪${levelData.reward}**\n\n` +
                        `🗣️ שמעון: "${congratsText}"`;

        await sock.sendMessage(chatJid, { 
            image: fs.readFileSync(cardPath),
            caption: caption,
            mentions: [senderFullJid]
        }, { quoted: msg });

        try { fs.unlinkSync(cardPath); } catch (e) {}
        
        // הערה: אנחנו לא עושים return כדי לאפשר לבוט להגיב גם לתוכן ההודעה המקורית אם צריך (למשל אם כתב "רולטה")
    }

    // 2. רולטה
    if (lowerText.includes('רולטה') || lowerText.includes('roulette')) {
        const triggered = await handleShimonRoulette(sock, chatJid, senderId, senderName, isGroup, msg);
        if (triggered) return; 
    }

    // 3. תמונות
    if (msg.message.imageMessage && shouldCheckImage(senderId, lowerText)) {
        await handleImageAnalysis(sock, msg, chatJid, senderId, senderName);
        return;
    }

    if (!text) return;

    // 4. כרטיס פרופיל (ידני)
    if (TRIGGER_PROFILE.some(t => lowerText.includes(t)) && lowerText.split(' ').length < 4) {
        await sock.sendPresenceUpdate('composing', chatJid);
        
        let avatarUrl;
        try { avatarUrl = await sock.profilePictureUrl(senderFullJid, 'image'); } catch { avatarUrl = null; }

        const waUserRef = await getUserFullProfile(senderId, senderName);
        const totalMessages = waUserRef.whatsappData?.totalMessages || 0; 
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

    // 5. 🎰 הימורים (משודרג)
    if (TRIGGER_BET.some(w => lowerText.includes(w))) {
        const betRes = await placeBet(senderId, senderName, lowerText);
        if (betRes) await sock.sendMessage(chatJid, { text: betRes }, { quoted: msg });
        return;
    }

    // --- AI ---
    const isReply = msg.message.extendedTextMessage?.contextInfo?.participant?.includes(sock.user.id.split(':')[0]);
    const isMention = lowerText.includes('@') && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.some(id => id.includes(sock.user.id.split(':')[0]));
    const isDirectQuestion = lowerText.startsWith('שמעון,'); 
    const isCurse = TRIGGER_CURSES.some(w => lowerText.includes(w)) && (lowerText.includes('שמעון') || isReply);
    
    if (!isReply && !isMention && !isDirectQuestion && !isCurse) {
        await rewardKindness(senderId, lowerText); 
        return; 
    }

    await sock.sendPresenceUpdate('composing', chatJid);

    const userProfile = await getUserFullProfile(senderId, senderName);
    const personalRoasts = getPersonalRoastData(senderName, userProfile.discordId);
    
    const randomRoast = personalRoasts.length > 0 
        ? personalRoasts[Math.floor(Math.random() * personalRoasts.length)] 
        : "";

    const injectedContext = `
    [משתמש]: ${senderName}
    [חומר רקע]: ${randomRoast}
    [סיטואציה]: ${isCurse ? "תקיפה מילולית." : "רגיל."}
    [קזינו]: ${isSessionActive() ? "פתוח" : "סגור"}
    `;

    const history = conversationHistory.get(chatJid) || [];
    const contextString = history.map(h => `${h.name}: ${h.content}`).join("\n");

    const systemMsg = generateSystemPrompt(senderName, randomRoast, contextString, injectedContext, "");

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemMsg }],
            max_tokens: 120, 
            temperature: 1.0 
        });

        let replyText = cleanReply(completion.choices[0].message.content);

        const factMatch = replyText.match(/{{FACT:\s*(.*?)}}/);
        if (factMatch) {
            await addFact(senderId, factMatch[1]);
            replyText = replyText.replace(factMatch[0], "").trim();
        }

        const voiceChance = isCurse ? 0.95 : 0.05; 
        const canVoice = await checkDailyVoiceLimit(senderId);
        
        if (canVoice && Math.random() < voiceChance) {
            await sock.sendPresenceUpdate('recording', chatJid);
            const audioBuffer = await generateVoiceNote(replyText); 
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
                await incrementVoiceUsage(senderId);
            } else {
                await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
            }
        } else {
            await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        }

        history.push({ name: senderName, content: text });
        history.push({ name: 'שמעון', content: replyText });
        if (history.length > 8) history.shift();
        conversationHistory.set(chatJid, history);

    } catch (e) {
        log(`Error in logic: ${e.message}`);
    }
}

module.exports = { handleMessageLogic };