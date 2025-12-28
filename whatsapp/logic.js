// ✅ ה-LID שלך (המנהל)
const ADMIN_NUMBER = '100772834480319'; 

const { delay } = require('@whiskeysockets/baileys');
const { OpenAI } = require('openai');
const { log } = require('../utils/logger');

// ייבוא המודולים
const { handleShimonRoulette } = require('./handlers/rouletteHandler');
const { getUserFullProfile, addFact, checkDailyVoiceLimit, incrementVoiceUsage } = require('./handlers/profileHandler');
const { handleImageAnalysis, addClaimToQueue, shouldCheckImage } = require('./handlers/visionHandler');
const { placeBet, resolveBets, isSessionActive } = require('./handlers/casinoHandler');
const { generateVoiceNote } = require('./handlers/voiceHandler');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- הגדרות מערכת ---
const GLOBAL_COOLDOWN = 3000; 
const IDLE_THRESHOLD = 60 * 60 * 1000; // שעה של שקט = שמעון מתערב
let lastBotReplyTime = 0;
let lastGroupActivity = Date.now(); // מעקב אחרי ההודעה האחרונה בקבוצה

// זיכרון שיחה (לכל קבוצה נשמור את 6 ההודעות האחרונות)
// המבנה: chatJid -> [{role: 'user'/'assistant', content: '...', name: '...'}]
const conversationHistory = new Map();

// אנטי ספאם
const spamTracker = new Map(); 

// מצבי רוח של שמעון (כדי שלא ישעמם)
const MOODS = [
    "Cynical & Sarcastic", // ברירת מחדל: עוקצני אבל חכם
    "Aggressive Arse",     // ערס עצבני (רק כשמציקים לו)
    "Chill & Stoned",      // סטלן זורם ("וואלה אחי...")
    "Philosopher",         // נותן תובנות מוזרות על החיים
    "Money Obsessed"       // מדבר רק על כסף והימורים
];

// --- פונקציות עזר ---

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
    // שמירת ההודעה
    history.push({ role, name, content: text });
    // שמירה רק על 6 האחרונות כדי לא להעמיס
    if (history.length > 6) history.shift();
    conversationHistory.set(chatJid, history);
}

function extractDamageClaim(text) {
    if (text.includes('דמג') || text.includes('נזק') || text.includes('dmg')) {
        const match = text.match(/(\d{3,})/); 
        if (match) return parseInt(match[1]);
    }
    return null;
}

// --- 📢 מנגנון "שבירת שתיקה" (יוזמה) ---
// הפונקציה הזו תיקרא מ-index.js פעם בדקה
async function checkIdleGroup(sock) {
    const mainGroupId = process.env.WHATSAPP_MAIN_GROUP_ID; 
    if (!mainGroupId) return;

    const now = Date.now();
    // אם עבר זמן הסף (שעה) מאז ההודעה האחרונה
    if (now - lastGroupActivity > IDLE_THRESHOLD) {
        lastGroupActivity = now; // מאפסים כדי שלא יחפור בלופ
        
        try {
            // מתייגים את כולם
            const metadata = await sock.groupMetadata(mainGroupId);
            const participants = metadata.participants.map(p => p.id);
            
            // יצירת משפט פתיחה מעניין
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "אתה שמעון, מנהל קבוצת וואטסאפ. יש שקט בקבוצה כבר שעה. תמציא משפט אחד קצר (בסלנג, מצחיק) שמעיר את כולם ומזמין אותם לדיסקורד או לקזינו. תהיה יצירתי." }
                ],
                max_tokens: 60,
                temperature: 0.8
            });
            
            const wakeUpText = completion.choices[0]?.message?.content?.trim() || "מה נרדמתם יא עגלות? קומו!";
            
            await sock.sendMessage(mainGroupId, { 
                text: `📢 **${wakeUpText}** @ALL`, // שימוש ב-@ALL ויזואלי
                mentions: participants // תיוג אמיתי
            });
            
            log('[Idle] ⏰ Woke up the group successfully.');

        } catch (e) { console.error("Idle Check Error:", e); }
    }
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
    
    // עדכון זמן פעילות לקבוצה (בשביל מנגנון השתיקה)
    if (isGroup) lastGroupActivity = Date.now();

    // שמירה בהיסטוריה
    updateHistory(chatJid, 'user', senderName, text);

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

    // 2. פקודות מערכת (רולטה, קזינו, השכמה ידנית)
    if (lowerText === 'שמעון' || lowerText === 'shimon') {
        const rouletteHandled = await handleShimonRoulette(sock, chatJid);
        if (rouletteHandled) return; 
    }
    
    // השכמה ידנית
    if (lowerText.includes('תעיר את כולם')) {
         const metadata = await sock.groupMetadata(chatJid);
         const participants = metadata.participants.map(p => p.id);
         await sock.sendMessage(chatJid, { text: `יאללה בלאגן! @ALL`, mentions: participants });
         return;
    }

    if (lowerText.startsWith('דבר ')) {
        const textToSpeak = text.substring(4).trim();
        if (textToSpeak.length > 2) {
            await sock.sendPresenceUpdate('recording', chatJid);
            const audioBuffer = await generateVoiceNote(textToSpeak);
            if (audioBuffer) await sock.sendMessage(chatJid, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
            return;
        }
    }

    if (lowerText.includes('שים') && lowerText.includes('על')) {
        const betResponse = await placeBet(senderId, senderName, lowerText);
        if (betResponse) {
            await sock.sendMessage(chatJid, { text: betResponse }, { quoted: msg });
            return; 
        }
    }

    // --- 🔥 מוח ה-AI החדש והדינאמי ---

    // בדיקה: האם צריך להגיב?
    // 1. קראו לי בשם
    // 2. יש שיחה פעילה ואני ב"שוונג"
    // 3. מישהו שאל שאלה ישירה
    const isDirectCall = lowerText.includes('שמעון') || lowerText.includes('shimon');
    const isQuestion = text.includes('?');
    const history = conversationHistory.get(chatJid) || [];
    
    // אם לא קראו לי, ואין שאלה, וזה סתם משפט - סיכוי קטן שנתערב (10%) כדי להיות "חי"
    if (!isDirectCall && Math.random() > 0.1) return; 
    
    if (Date.now() - lastBotReplyTime < GLOBAL_COOLDOWN) return;
    lastBotReplyTime = Date.now();
    await sock.sendPresenceUpdate('composing', chatJid);

    // הכנת נתונים
    const userProfile = await getUserFullProfile(senderId, senderName);
    let injectedData = "";
    
    if (lowerText.includes('כסף') || lowerText.includes('ארנק')) {
        const balance = userProfile.discordData ? (userProfile.discordData.xp || 0) : 0;
        injectedData = `[מידע מערכת: למשתמש יש ₪${balance}]`;
    }

    const claimedDmg = extractDamageClaim(lowerText);
    if (claimedDmg) injectedData += ` [הוא טוען ל-${claimedDmg} דמג'.]`;

    // בחירת מצב רוח דינאמי
    let currentMood = MOODS[0]; // Cynical
    if (lowerText.includes('סתום') || lowerText.includes('מניאק') || lowerText.includes('אפס')) currentMood = MOODS[1]; // Aggressive
    else if (lowerText.includes('חחח') || lowerText.includes('חזק')) currentMood = MOODS[2]; // Chill
    else if (Math.random() < 0.2) currentMood = MOODS[3]; // Philosopher (הפתעה)

    // בניית ההיסטוריה לפרומפט (כדי שיבין הקשר)
    const contextString = history.map(h => `${h.name}: ${h.content}`).join("\n");

    const systemMsg = `
    אתה שמעון. בוט וואטסאפ ישראלי, אותנטי ודינאמי.
    כרגע אתה במצב רוח: **${currentMood}**.
    
    הנחיות התנהגות (חובה):
    1. **גיוון:** בחיים אל תחזור על אותו משפט פעמיים. אסור להגיד "סתום ת'פה יא אפס" יותר מפעם ביום. תהיה יצירתי.
    2. **הבנת סיטואציה:** קרא את ההודעות האחרונות. אם צוחקים - תצחק. אם רבים - תתערב. אם שואלים - תענה (בדרכך).
    3. **שפה:** סלנג ישראלי שוטף. מותר לקלל, אבל רק כשזה מתאים לסיטואציה (לא סתם).
    4. **זיכרון:** השתמש במידע שיש לך על המשתמש כדי לעקוץ אותו בצורה חכמה, לא סתם לקלל.
    
    מידע על המשתמש הנוכחי (${senderName}):
    ${userProfile.facts ? userProfile.facts.map(f => f.content).join(". ") : "אין מידע מיוחד."}
    ${userProfile.roastMaterial ? `נקודת תורפה: ${userProfile.roastMaterial}` : ""}
    ${injectedData}

    היסטוריית השיחה האחרונה (כדי שתבין הקשר):
    ${contextString}
    
    תגובה (עד 2 משפטים):
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemMsg }],
            max_tokens: 150,
            temperature: 0.8 // מאוזן
        });

        let replyText = completion.choices[0]?.message?.content?.trim();
        
        // שמירת התגובה שלנו בהיסטוריה
        updateHistory(chatJid, 'assistant', 'שמעון', replyText);

        // בדיקה: האם לענות בקול?
        const canSendVoice = await checkDailyVoiceLimit(senderId);
        // סיכוי של 25% לקול, אלא אם זה מצב רוח "פילוסוף" ואז פחות
        const shouldReplyWithVoice = Math.random() < 0.25 && canSendVoice;

        if (shouldReplyWithVoice) {
            await sock.sendPresenceUpdate('recording', chatJid); 
            const audioBuffer = await generateVoiceNote(replyText);
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                await incrementVoiceUsage(senderId);
            } else {
                // גיבוי אם הקול נכשל
                await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
            }
        } else {
            await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        }
        
        await sock.sendPresenceUpdate('paused', chatJid);

    } catch (error) { console.error('AI Error:', error); }
}

module.exports = { handleMessageLogic, checkIdleGroup };