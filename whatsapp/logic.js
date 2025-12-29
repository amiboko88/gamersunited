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
const { updateBirthday } = require('./handlers/waBirthdayHandler'); // הוספת ימי הולדת
const { generateSystemPrompt } = require('./persona'); // התנ"ך

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GLOBAL_COOLDOWN = 2000; 
let lastBotReplyTime = 0;
const spamTracker = new Map(); 
const conversationHistory = new Map();

// --- 📋 טריגרים ---
const TRIGGER_CURSES = ['סתום', 'שקט', 'אפס', 'מניאק', 'שרמוטה', 'הומו', 'קוקסינל', 'זדיין', 'זין', 'חופר', 'שתוק', 'מעפן', 'חלש', 'טמבל'];
const TRIGGER_BATTLE = ['קורע', 'מפרק', 'משחק', 'לובי', 'סקוואד', 'ניצחון', 'ווין', 'win', 'נוב', 'בוט', 'חזק', 'חלש'];
const TRIGGER_DISCORD = ['עלייה', 'עולים', 'באים', 'דיסקורד', 'וורזון', 'warzone', 'מתי', 'משחקים', 'כנסו'];
const TRIGGER_INFO = ['איפה כולם', 'מי מחובר', 'כמה כסף', 'כמה xp', 'מצב טבלה'];

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

    // 1. Vision (תמונות)
    if (msg.message.imageMessage) {
        const caption = text ? text.toLowerCase() : "";
        if (shouldCheckImage(senderId, caption)) {
            const analysisResult = await handleImageAnalysis(sock, msg, chatJid, senderId, senderName);
            if (analysisResult) return; 
        }
    }

    if (!text) return;
    if (checkSpam(senderId).isBlocked) return; 

    // 2. זיהוי עדכון יום הולדת (לפני הכל)
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
                return; // עצרנו כאן
            }
        } catch (e) { console.error('Birthday Extract Error:', e); }
    }

    // 3. פקודות ישירות
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

    // --- 🔥 מוח ה-AI שמחליט מתי להגיב 🔥 ---
    let shouldTrigger = false;
    let triggerContext = ""; 

    // א. קריאה ישירה / תיוג
    const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const amIMentioned = mentionedJids.some(jid => jid.includes(sock.user?.id?.split(':')[0]));

    if (lowerText.includes('שמעון') || lowerText.includes('shimon') || amIMentioned) {
        shouldTrigger = true;
        triggerContext = "פנייה ישירה/תיוג.";
    }

    // ב. זיהוי ספאם תיוגים
    if (!shouldTrigger && mentionedJids.length > 3) {
        shouldTrigger = true;
        triggerContext = `המשתמש תייג ${mentionedJids.length} אנשים. זה ספאם.`;
    }

    // ג. שאלות אינפורמציה
    if (TRIGGER_INFO.some(w => lowerText.includes(w))) {
        shouldTrigger = true;
        triggerContext = "בקשת מידע (תהיה ענייני).";
    }

    // ד. מילות מפתח
    if (!shouldTrigger) {
        if (TRIGGER_DISCORD.some(w => lowerText.includes(w))) {
            if (Math.random() < 0.7) { 
                shouldTrigger = true;
                triggerContext = "שיחה על דיסקורד/משחק.";
            }
        } else if (TRIGGER_BATTLE.some(w => lowerText.includes(w))) {
            if (Math.random() < 0.6) {
                shouldTrigger = true;
                triggerContext = "אווירת תחרות.";
            }
        }
    }

    // ה. הקשר שיחה
    const isActiveConvo = conversationHistory.get(chatJid)?.length > 0;
    if (!shouldTrigger && isActiveConvo) {
        if (TRIGGER_CURSES.some(w => lowerText.includes(w))) {
            shouldTrigger = true;
            triggerContext = "קללות בשיחה.";
        }
    }

    // ו. כסף ודמג'
    const userProfile = await getUserFullProfile(senderId, senderName);
    let injectedData = "";

    if (lowerText.includes('כסף') || lowerText.includes('ארנק')) {
        shouldTrigger = true;
        const balance = userProfile.discordData ? (userProfile.discordData.xp || 0) : 0;
        injectedData = `[מצב חשבון: ₪${balance}]`;
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
    if (Date.now() - lastBotReplyTime < GLOBAL_COOLDOWN) return;
    
    lastBotReplyTime = Date.now();
    await sock.sendPresenceUpdate('composing', chatJid);

    // --- בניית הפרומפט בעזרת התנ"ך ---
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
            temperature: 0.9 
        });

        let replyText = completion.choices[0]?.message?.content?.trim();
        
        // למידה (הספר השחור)
        const factMatch = replyText.match(/{{FACT:\s*(.*?)}}/);
        if (factMatch) {
            const newFact = factMatch[1];
            await addFact(senderId, newFact);
            log(`[BlackBook] 📓 Learned: ${newFact}`);
            replyText = replyText.replace(factMatch[0], "").trim();
        }

        updateHistory(chatJid, 'assistant', 'שמעון', replyText);

        // החלטה על קול vs טקסט
        const canSendVoice = await checkDailyVoiceLimit(senderId);
        let voiceChance = 0.2;
        if (replyText.includes('!') || replyText.includes('מניאק') || replyText.length < 20) voiceChance = 0.4;
        if (triggerContext.includes('מידע') || triggerContext.includes('יתרה')) voiceChance = 0.05;

        const shouldReplyWithVoice = Math.random() < voiceChance && canSendVoice;

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