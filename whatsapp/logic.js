// ✅ ה-LID שלך (המנהל)
const ADMIN_NUMBER = '100772834480319'; 

const { delay } = require('@whiskeysockets/baileys');
const { OpenAI } = require('openai');
const { log } = require('../utils/logger');
const fs = require('fs'); // דרוש לשליחת התמונה

// ייבוא המודולים
const { handleShimonRoulette } = require('./handlers/rouletteHandler');
// ✅ ייבוא פונקציית ספירת ההודעות החדשה
const { getUserFullProfile, addFact, checkDailyVoiceLimit, incrementVoiceUsage, incrementTotalMessages } = require('./handlers/profileHandler');
const { handleImageAnalysis, addClaimToQueue, shouldCheckImage } = require('./handlers/visionHandler');
const { placeBet, resolveBets, isSessionActive } = require('./handlers/casinoHandler');
const { generateVoiceNote } = require('./handlers/voiceHandler'); 
const { updateBirthday } = require('./handlers/waBirthdayHandler');
const { generateSystemPrompt } = require('./persona'); 
// ✅ ייבוא הצייר החדש
const { generateProfileCard } = require('./handlers/profileRenderer');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GLOBAL_COOLDOWN = 2000; 
let lastBotReplyTime = 0;

// מעקבים
const spamTracker = new Map(); 
const conversationHistory = new Map();
const dailyMessageTracker = new Map(); 
const MAX_DAILY_INTERACTIONS = 15;

const BRUSH_OFF_RESPONSES = [
    "שחרר ממני להיום, אין לי כוח אליך.",
    "די חפרת. נגמרה לי הסבלנות.",
    "אין קליטה, תנסה מחר.",
    "הבוט בהפסקת סיגריה. יאללה ביי.",
    "עברת את המכסה היומית. ביי.",
    "דבר ללמפה."
];

// --- 🧠 טריגרים ---
const TRIGGER_CURSES = ['סתום', 'שקט', 'אפס', 'מניאק', 'שרמוטה', 'הומו', 'קוקסינל', 'זדיין', 'זין', 'חופר', 'שתוק', 'מעפן', 'חלש', 'טמבל', 'חתיכת', 'זבל', 'כלב', 'בן זונה'];
const TRIGGER_BATTLE = ['קורע', 'מפרק', 'משחק', 'לובי', 'סקוואד', 'ניצחון', 'ווין', 'win', 'נוב', 'בוט', 'חזק', 'חלש'];

// טריגרים לכרטיס פרופיל
const TRIGGER_PROFILE = ['פרופיל', 'הכרטיס שלי', 'מי אני', 'סטטוס', 'profile', 'rank', 'כרטיס'];

const TRIGGER_DISCORD = [
    'דיסקורד', 'וורזון', 'warzone', 'משחקים', 
    'כנס', 'צטרף', 'עול', 'גיע', /ב(\.|)?ו(\.|)?א/
];

const TRIGGER_INFO = ['איפה כולם', 'מי מחובר', 'כמה כסף', 'כמה xp', 'מצב טבלה', 'כמה בארנק', 'יתרה'];
const TRIGGER_BET = ['שים', 'להמר', 'הימור', 'bet', 'שם']; 

function hasTrigger(text, triggerList) {
    return triggerList.some(trigger => {
        if (trigger instanceof RegExp) return trigger.test(text);
        return text.includes(trigger);
    });
}

function cleanReply(text, senderName) {
    if (!text) return "";
    let cleaned = text.replace(/^שמעון:\s*/, '').replace(/^Shimon:\s*/, '').replace(/^Bot:\s*/, '').replace(/^"|"$/g, '').trim();
    if (senderName) {
        const nameRegex = new RegExp(`^${senderName}[,:-]?\\s*`, 'i');
        cleaned = cleaned.replace(nameRegex, '');
    }
    return cleaned;
}

function checkDailyLimit(userId) {
    const today = new Date().toISOString().split('T')[0];
    let userData = dailyMessageTracker.get(userId) || { date: today, count: 0 };
    if (userData.date !== today) userData = { date: today, count: 0 };
    if (userData.count >= MAX_DAILY_INTERACTIONS) return { allowed: false };
    userData.count++;
    dailyMessageTracker.set(userId, userData);
    return { allowed: true };
}

function checkSpam(userId) {
    const now = Date.now();
    let userData = spamTracker.get(userId) || { count: 0, blockedUntil: 0, lastMsg: 0 };
    if (now < userData.blockedUntil) return { isBlocked: true, shouldAlert: false };
    if (now - userData.lastMsg > 30000) userData.count = 0;
    userData.count++;
    userData.lastMsg = now;
    if (userData.count >= 6) {
        userData.blockedUntil = now + 60000;
        spamTracker.set(userId, userData);
        return { isBlocked: true, shouldAlert: true };
    }
    spamTracker.set(userId, userData);
    return { isBlocked: false, shouldAlert: false };
}

function updateHistory(chatJid, role, name, text) {
    let history = conversationHistory.get(chatJid) || [];
    history.push({ role, name, content: text });
    if (history.length > 8) history.shift(); 
    conversationHistory.set(chatJid, history);
}

function extractDamageClaim(text) {
    if (text.includes('דמג') || text.includes('נזק') || text.includes('dmg')) {
        const match = text.match(/(\d{3,})/); 
        if (match) return parseInt(match[1]);
    }
    return null;
}

// --- הלוגיקה הראשית ---
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid; 
    const isGroup = chatJid.endsWith('@g.us');
    const senderFullJid = isGroup ? (msg.key.participant || msg.participant) : chatJid;
    const senderId = senderFullJid ? senderFullJid.split('@')[0] : 'unknown';
    const isAdmin = senderId === ADMIN_NUMBER;

    if (!isGroup && !isAdmin) return; 

    const senderName = msg.pushName || "פלוני";
    const lowerText = text.trim().toLowerCase();
    
    updateHistory(chatJid, 'user', senderName, text);
    
    // ✅ ספירת הודעות (חובה בשביל הפרופיל)
    incrementTotalMessages(senderId);

    // 1. Vision
    if (msg.message.imageMessage) {
        const caption = text ? text.toLowerCase() : "";
        if (shouldCheckImage(senderId, caption)) {
            const analysisResult = await handleImageAnalysis(sock, msg, chatJid, senderId, senderName);
            if (analysisResult) return; 
        }
    }

    if (!text) return;
    if (checkSpam(senderId).isBlocked) return; 

    // --- 🎫 כרטיס שחקן (פרופיל) 🎫 ---
    const wordCount = lowerText.split(/\s+/).length;
    if (hasTrigger(lowerText, TRIGGER_PROFILE) && wordCount <= 3) { 
        await sock.sendPresenceUpdate('composing', chatJid);

        let avatarUrl;
        try {
            avatarUrl = await sock.profilePictureUrl(senderFullJid, 'image');
        } catch {
            avatarUrl = null; 
        }

        const waUserRef = await getUserFullProfile(senderId, senderName);
        
        // שליפת הנתונים מהפרופיל שקיבלנו
        const totalMessages = waUserRef.whatsappData?.totalMessages || 0; 
        const balance = waUserRef.discordData?.xp || 0;

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

    // 2. ימי הולדת
    if (lowerText.includes('יום הולדת') && (lowerText.includes('שלי') || lowerText.includes('ב-') || /\d/.test(lowerText))) {
        try {
            const dateExtraction = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "חלץ תאריך (DD/MM) מהטקסט. אם אין תאריך, החזר 'null'. דוגמה: 'ב-15 למאי' -> '15/05'" },
                    { role: "user", content: text }
                ],
                temperature: 0
            });
            const extractedDate = dateExtraction.choices[0].message.content.trim();
            if (extractedDate !== 'null' && extractedDate.includes('/')) {
                const response = await updateBirthday(senderId, extractedDate);
                await sock.sendMessage(chatJid, { text: response }, { quoted: msg });
                return; 
            }
        } catch (e) { console.error('Birthday Extract Error:', e); }
    }

    // 3. פקודות ידניות
    if (lowerText === 'שמעון' || lowerText === 'shimon') {
        const rouletteHandled = await handleShimonRoulette(sock, chatJid);
        if (rouletteHandled) return; 
    }
    
    if (lowerText.includes('תעיר את כולם') || lowerText.includes('@all')) {
         const metadata = await sock.groupMetadata(chatJid);
         const participants = metadata.participants.map(p => p.id);
         await sock.sendMessage(chatJid, { text: `📢 **יאללה תתעוררו!** @ALL\nמחכים לכם בדיסקורד.`, mentions: participants });
         return;
    }

    if (lowerText.startsWith('דבר ')) {
        const textToSpeak = text.substring(4).trim();
        if (textToSpeak.length > 2) {
            await sock.sendPresenceUpdate('recording', chatJid);
            const audioBuffer = await generateVoiceNote(textToSpeak);
            if (audioBuffer) await sock.sendMessage(chatJid, { 
                audio: audioBuffer, 
                mimetype: 'audio/mp4', // ✅ אנדרואיד fix
                ptt: true 
            }, { quoted: msg });
            return;
        }
    }

    // הימורים
    if (TRIGGER_BET.some(w => lowerText.includes(w)) && lowerText.includes('על')) {
        const betResponse = await placeBet(senderId, senderName, lowerText);
        if (betResponse) {
            await sock.sendMessage(chatJid, { text: betResponse }, { quoted: msg });
            return; 
        }
    }

    // --- טריגרים ל-AI ---
    let shouldTrigger = false;
    let triggerContext = ""; 

    const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const amIMentioned = mentionedJids.some(jid => jid.includes(sock.user?.id?.split(':')[0]));

    if (lowerText.includes('שמעון') || lowerText.includes('shimon') || amIMentioned) {
        shouldTrigger = true;
        triggerContext = "פנייה ישירה/תיוג.";
    }

    if (!shouldTrigger && mentionedJids.length > 3) {
        shouldTrigger = true;
        triggerContext = `המשתמש תייג ${mentionedJids.length} אנשים. זה ספאם.`;
    }

    if (hasTrigger(lowerText, TRIGGER_INFO)) {
        shouldTrigger = true;
        triggerContext = "בקשת מידע טכני (תהיה ענייני, בלי קול).";
    }

    if (!shouldTrigger) {
        if (hasTrigger(lowerText, TRIGGER_DISCORD)) {
            if (Math.random() < 0.7) { 
                shouldTrigger = true;
                triggerContext = "שיחה על דיסקורד/משחק.";
            }
        } else if (hasTrigger(lowerText, TRIGGER_BATTLE)) {
            if (Math.random() < 0.6) {
                shouldTrigger = true;
                triggerContext = "אווירת תחרות.";
            }
        }
    }

    const isActiveConvo = conversationHistory.get(chatJid)?.length > 0;
    
    if (!shouldTrigger && isActiveConvo) {
        if (hasTrigger(lowerText, TRIGGER_CURSES)) {
            shouldTrigger = true;
            triggerContext = "קללות בשיחה.";
        }
        const lastMsg = conversationHistory.get(chatJid).slice(-2)[0];
        if (!shouldTrigger && lastMsg && lastMsg.role === 'assistant' && text.length < 15) {
            if (Math.random() < 0.8) {
                shouldTrigger = true;
                triggerContext = "תגובה קצרה מיד אחרי שדיברת.";
            }
        }
    }

    // --- הכנת נתונים ל-AI ---
    const userProfile = await getUserFullProfile(senderId, senderName);
    let injectedData = "";

    const casinoStatus = isSessionActive() ? "🟢 הקזינו פתוח!" : "🔴 הקזינו סגור.";
    injectedData += ` [סטטוס קזינו: ${casinoStatus}]`;

    if (lowerText.includes('כסף') || lowerText.includes('ארנק') || lowerText.includes('xp')) {
        shouldTrigger = true;
        const balance = userProfile.discordData ? (userProfile.discordData.xp || 0) : 0;
        injectedData += ` [מצב חשבון: ₪${balance}]`;
        if (!triggerContext) triggerContext = "שאלה על יתרה.";
    }

    const claimedDmg = extractDamageClaim(lowerText);
    if (claimedDmg) {
        shouldTrigger = true;
        injectedData += ` [טוען ל-${claimedDmg} דמג'.]`;
        if (isSessionActive()) addClaimToQueue(senderId, claimedDmg);
        triggerContext = "דיווח דמג'.";
    }

    if (!shouldTrigger) return;
    
    if (!triggerContext.includes('קללות') && Date.now() - lastBotReplyTime < GLOBAL_COOLDOWN) return;

    // --- ⛔ בדיקת מכסה יומית ⛔ ---
    const limitCheck = checkDailyLimit(senderId);
    if (!limitCheck.allowed) {
        const brushOff = BRUSH_OFF_RESPONSES[Math.floor(Math.random() * BRUSH_OFF_RESPONSES.length)];
        await sock.sendMessage(chatJid, { text: brushOff }, { quoted: msg });
        return;
    }
    
    lastBotReplyTime = Date.now();
    await sock.sendPresenceUpdate('composing', chatJid);

    const history = conversationHistory.get(chatJid) || [];
    const contextString = history.map(h => `${h.name}: ${h.content}`).join("\n");
    
    const personalInfo = [
        ...(userProfile.facts ? userProfile.facts.map(f => f.content) : []),
        (userProfile.roastMaterial ? userProfile.roastMaterial : "")
    ].filter(Boolean).join(". ");

    const systemMsg = generateSystemPrompt(
        senderName, 
        personalInfo, 
        contextString, 
        triggerContext, 
        injectedData 
    );

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemMsg }],
            max_tokens: 150,
            temperature: 0.95 
        });

        let replyText = cleanReply(completion.choices[0]?.message?.content, senderName);
        
        const factMatch = replyText.match(/{{FACT:\s*(.*?)}}/);
        if (factMatch) {
            const newFact = factMatch[1];
            await addFact(senderId, newFact);
            log(`[BlackBook] 📓 Learned: ${newFact}`);
            replyText = replyText.replace(factMatch[0], "").trim();
        }

        updateHistory(chatJid, 'assistant', 'שמעון', replyText);

        const canSendVoice = await checkDailyVoiceLimit(senderId);
        let voiceChance = 0.2;

        if (replyText.includes('!') || replyText.includes('מניאק') || triggerContext.includes('קללות')) voiceChance = 0.5;
        if (triggerContext.includes('מידע') || triggerContext.includes('יתרה') || triggerContext.includes('טכני')) voiceChance = 0;

        const shouldReplyWithVoice = Math.random() < voiceChance && canSendVoice;

        if (shouldReplyWithVoice) {
            await sock.sendPresenceUpdate('recording', chatJid); 
            const audioBuffer = await generateVoiceNote(replyText);
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mp4', // ✅ אנדרואיד fix
                    ptt: true 
                }, { quoted: msg });
                await incrementVoiceUsage(senderId);
            } else {
                await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
            }
        } else {
            await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        }
        
        await sock.sendPresenceUpdate('paused', chatJid);

    } catch (error) { console.error('AI Error:', error); }
}

module.exports = { handleMessageLogic };