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
const GLOBAL_COOLDOWN = 2000; 
let lastBotReplyTime = 0;
const spamTracker = new Map(); 

// זיכרון שיחה
const conversationHistory = new Map();

// --- 📋 רשימות טריגרים חכמות ---
const TRIGGER_CURSES = ['סתום', 'שקט', 'אפס', 'מניאק', 'שרמוטה', 'הומו', 'קוקסינל', 'זדיין', 'זין', 'חופר', 'שתוק', 'מעפן', 'חלש'];
const TRIGGER_BATTLE = ['קורע', 'מפרק', 'משחק', 'לובי', 'סקוואד', 'ניצחון', 'ווין', 'win', 'נוב', 'בוט', 'חזק', 'חלש'];
const TRIGGER_DISCORD = ['עלייה', 'עולים', 'באים', 'דיסקורד', 'וורזון', 'warzone', 'מתי', 'משחקים', 'כנסו'];

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

    // 2. פקודות ידניות
    if (lowerText === 'שמעון' || lowerText === 'shimon') {
        const rouletteHandled = await handleShimonRoulette(sock, chatJid);
        if (rouletteHandled) return; 
    }
    
    // השכמה ידנית
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

    // --- 🔥 המוח שמחליט מתי להגיב 🔥 ---
    let shouldTrigger = false;
    let triggerContext = ""; // כדי שה-AI ידע למה הערנו אותו

    // א. קריאה ישירה / תיוג של שמעון
    // בודקים גם תיוג ברמת הפרוטוקול
    const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    // (צריך לבדוק אם המספר של הבוט נמצא ברשימת התיוגים, אבל נסתמך גם על טקסט)
    if (lowerText.includes('שמעון') || lowerText.includes('shimon')) {
        shouldTrigger = true;
        triggerContext = "קראו לך בשם.";
    }

    // ב. זיהוי ספאם תיוגים (יוגי משתולל)
    if (!shouldTrigger && mentionedJids.length > 3) {
        shouldTrigger = true;
        triggerContext = `המשתמש תייג ${mentionedJids.length} אנשים בבת אחת. תרד עליו שהוא ספאמר.`;
    }

    // ג. מילות מפתח (רק אם לא קראו לו ישירות, ניתן סיכוי גבוה)
    if (!shouldTrigger) {
        if (TRIGGER_DISCORD.some(w => lowerText.includes(w))) {
            // זיהוי ארגון משחק -> שמעון דוחף
            if (Math.random() < 0.7) { 
                shouldTrigger = true;
                triggerContext = "מנסים לארגן משחק/עלייה לדיסקורד. תדרבן אותם.";
            }
        } else if (TRIGGER_BATTLE.some(w => lowerText.includes(w))) {
            // זיהוי תחרות/טראש טוק -> שמעון מצטרף לחגיגה
            if (Math.random() < 0.6) {
                shouldTrigger = true;
                triggerContext = "יש אווירה של תחרות/ירידות (Trash Talk). תצטרף ותעקוץ.";
            }
        }
    }

    // ד. הקשר שיחה (אם הוא כבר דיבר, הוא ממשיך)
    const lastAssistantMsg = conversationHistory.get(chatJid)?.filter(m => m.role === 'assistant').pop();
    const isActiveConvo = conversationHistory.get(chatJid)?.length > 0; // פשטנו את זה
    
    if (!shouldTrigger && isActiveConvo) {
        // אם קיללו - תגובה בטוחה
        if (TRIGGER_CURSES.some(w => lowerText.includes(w))) {
            shouldTrigger = true;
            triggerContext = "מישהו מקלל בשיחה. אל תצא פראייר.";
        }
    }

    // ה. כסף ודמג'
    const userProfile = await getUserFullProfile(senderId, senderName);
    let injectedData = "";

    if (lowerText.includes('כסף') || lowerText.includes('ארנק')) {
        shouldTrigger = true;
        const balance = userProfile.discordData ? (userProfile.discordData.xp || 0) : 0;
        injectedData = `[ארנק: ₪${balance}]`;
        triggerContext = "שאלו על כסף.";
    }

    const claimedDmg = extractDamageClaim(lowerText);
    if (claimedDmg) {
        shouldTrigger = true;
        injectedData += ` [טוען ל-${claimedDmg} דמג'.]`;
        if (isSessionActive()) addClaimToQueue(senderId, claimedDmg);
        triggerContext = "דיווח דמג'.";
    }

    if (!shouldTrigger) return;
    if (Date.now() - lastBotReplyTime < GLOBAL_COOLDOWN) return;
    
    lastBotReplyTime = Date.now();
    await sock.sendPresenceUpdate('composing', chatJid);

    // הכנת הפרומפט
    const history = conversationHistory.get(chatJid) || [];
    const contextString = history.map(h => `${h.name}: ${h.content}`).join("\n");
    
    const personalInfo = [
        ...(userProfile.facts ? userProfile.facts.map(f => f.content) : []),
        (userProfile.roastMaterial ? userProfile.roastMaterial : "")
    ].filter(Boolean).join(". ");

    const systemMsg = `
    אתה שמעון. גיימר ישראלי וותיק, ציני וחד.
    
    הסיבה שהתערבת עכשיו: ${triggerContext}
    
    הנחיות:
    1. **אל תחזור על עצמך.** תהיה מגוון.
    2. **שפה:** סלנג ישראלי טבעי.
    3. **ספר שחור:** אם יש מידע חדש (עבודה, רכב, חברה) - הוסף בסוף: {{FACT: המידע}}.
    4. **יחס אישי:** השתמש במידע למטה כדי לעקוץ את ${senderName}.
    
    מידע על ${senderName}:
    ${personalInfo || "אין מידע מיוחד."}
    ${injectedData}
    
    היסטוריה אחרונה:
    ${contextString}
    
    תגובה (עד 2 משפטים):
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemMsg }],
            max_tokens: 150,
            temperature: 0.9
        });

        let replyText = completion.choices[0]?.message?.content?.trim();
        
        // שמירת עובדות
        const factMatch = replyText.match(/{{FACT:\s*(.*?)}}/);
        if (factMatch) {
            const newFact = factMatch[1];
            await addFact(senderId, newFact);
            log(`[BlackBook] 📓 Learned: ${newFact}`);
            replyText = replyText.replace(factMatch[0], "").trim();
        }

        updateHistory(chatJid, 'assistant', 'שמעון', replyText);

        const canSendVoice = await checkDailyVoiceLimit(senderId);
        const shouldReplyWithVoice = Math.random() < 0.2 && canSendVoice;

        if (shouldReplyWithVoice) {
            await sock.sendPresenceUpdate('recording', chatJid); 
            const audioBuffer = await generateVoiceNote(replyText);
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
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