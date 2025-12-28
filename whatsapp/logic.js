// ✅ ה-LID שלך (המנהל)
const ADMIN_NUMBER = '100772834480319'; 

const { delay } = require('@whiskeysockets/baileys');
const { OpenAI } = require('openai');
const { log } = require('../utils/logger');

// ייבוא המודולים (Handlers)
const { handleShimonRoulette } = require('./handlers/rouletteHandler');
const { getUserFullProfile, addFact, checkDailyVoiceLimit, incrementVoiceUsage } = require('./handlers/profileHandler');
const { handleImageAnalysis, addClaimToQueue, shouldCheckImage } = require('./handlers/visionHandler');
const { placeBet, resolveBets, isSessionActive } = require('./handlers/casinoHandler');
const { generateVoiceNote } = require('./handlers/voiceHandler');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GLOBAL_COOLDOWN = 2000; 
let lastBotReplyTime = 0;
const spamTracker = new Map(); 

// --- מנגנון אנטי-ספאם ---
function checkSpam(userId) {
    const now = Date.now();
    let userData = spamTracker.get(userId) || { count: 0, blockedUntil: 0, lastMsg: 0 };
    if (now < userData.blockedUntil) return { isBlocked: true, shouldAlert: false };
    if (now - userData.lastMsg > 30000) userData.count = 0;
    userData.count++;
    userData.lastMsg = now;
    if (userData.count >= 4) {
        userData.blockedUntil = now + 60000;
        spamTracker.set(userId, userData);
        return { isBlocked: true, shouldAlert: true };
    }
    spamTracker.set(userId, userData);
    return { isBlocked: false, shouldAlert: false };
}

// --- חילוץ מספרים (לדמג') ---
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

    const senderName = msg.pushName || "לא ידוע";
    
    // 1. 🖼️ Vision (טיפול בתמונות)
    if (msg.message.imageMessage) {
        const caption = text ? text.toLowerCase() : "";
        if (shouldCheckImage(senderId, caption)) {
            const analysisResult = await handleImageAnalysis(sock, msg, chatJid, senderId, senderName);
            if (analysisResult) return; // טופל ע"י הראייה
        }
    }

    if (!text) return;

    // 2. 🛡️ Spam Check
    const spamStatus = checkSpam(senderId);
    if (spamStatus.isBlocked) {
        if (spamStatus.shouldAlert) await sock.sendMessage(chatJid, { text: "שחרר, אתה בחסימה. סע." }, { quoted: msg });
        return; 
    }

    const lowerText = text.trim().toLowerCase();
    
    // 3. 🎲 Roulette (סטיקרים/גיפים) - עדיפות ראשונה
    if (lowerText === 'שמעון' || lowerText === 'shimon') {
        const rouletteHandled = await handleShimonRoulette(sock, chatJid);
        if (rouletteHandled) return; 
    }

    // 4. 🎙️ בדיקה ידנית (למנהל/בדיקות): "דבר [טקסט]"
    if (lowerText.startsWith('דבר ')) {
        const textToSpeak = text.substring(4).trim();
        if (textToSpeak.length > 2) {
            await sock.sendPresenceUpdate('recording', chatJid);
            const audioBuffer = await generateVoiceNote(textToSpeak);
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mpeg', 
                    ptt: true 
                }, { quoted: msg });
                return;
            }
        }
    }

    // 5. 💰 Casino Bets
    if (lowerText.includes('שים') && lowerText.includes('על')) {
        const betResponse = await placeBet(senderId, senderName, lowerText);
        if (betResponse) {
            await sock.sendMessage(chatJid, { text: betResponse }, { quoted: msg });
            return; 
        }
    }

    // 6. 🧠 Data Prep for AI
    const userProfile = await getUserFullProfile(senderId, senderName);
    const now = Date.now();
    let shouldTrigger = false;
    let injectedData = ""; 

    // בדיקות כסף (שקלים)
    if (lowerText.includes('כמה כסף') || lowerText.includes('כמה יש לי') || lowerText.includes('ארנק') || lowerText.includes('יתרה')) {
        shouldTrigger = true;
        const balance = userProfile.discordData ? (userProfile.discordData.xp || 0) : 0;
        if (balance < 500) injectedData = `[המשתמש שואל כמה כסף יש לו: ₪${balance}. רד עליו שהוא תפרן.]`;
        else if (balance > 5000) injectedData = `[המשתמש שואל כמה כסף יש לו: ₪${balance}. הוא טחון. תבקש הלוואה.]`;
        else injectedData = `[המשתמש שואל כמה כסף יש לו: ₪${balance}.]`;
    }

    // בדיקות דמג'
    const claimedDmg = extractDamageClaim(lowerText);
    if (claimedDmg && claimedDmg > 500) {
        shouldTrigger = true;
        if (isSessionActive()) {
            addClaimToQueue(senderId, claimedDmg); 
            injectedData = `[המשתמש טוען: ${claimedDmg} דמג'. דרוש הוכחה!]`;
        } else {
            injectedData = `[דיווח ידני: ${claimedDmg} דמג'. אין משחק פעיל.]`;
        }
    }
    else if (lowerText.includes('רשימה') || lowerText.includes('פעילים')) shouldTrigger = true;
    else if (lowerText.includes('שמעון') || lowerText.includes('shimon')) shouldTrigger = true;
    else if (userProfile.justLinked) {
        shouldTrigger = true;
        injectedData += ` [הודעת מערכת: זיהיתי עכשיו שזה ${userProfile.discordData.displayName} מדיסקורד!]`;
    }

    if (!isGroup) shouldTrigger = true;
    if (!shouldTrigger) return;
    if (now - lastBotReplyTime < GLOBAL_COOLDOWN) return;

    lastBotReplyTime = now;
    await sock.sendPresenceUpdate('composing', chatJid);

    // --- 🎲 החלטה: קול או טקסט? ---
    // 1. האם יש למשתמש מכסה יומית פנויה (פחות מ-3)?
    const canSendVoice = await checkDailyVoiceLimit(senderId);
    // 2. הגרלה של 20% סיכוי
    const shouldReplyWithVoice = Math.random() < 0.2 && canSendVoice;

    // בניית הפרומפט
    let systemMsg = `אתה שמעון. בוט וואטסאפ, עבריין צעצוע. קצר ולעניין.`;
    
    if (shouldReplyWithVoice) {
        // הנחיה מיוחדת ל-AI שהתשובה הולכת להיות מוקלטת
        systemMsg += `\n**חשוב: אתה שולח הודעה קולית!** התשובה חייבת להיות קצרה, חדה, טבעית ומדוברת. בלי רשימות ובלי אימוג'ים. מקסימום 2 משפטים. תהיה אקספרסיבי.`;
    }

    if (userProfile.discordData) systemMsg += `\nמולך: ${userProfile.discordData.displayName}`;
    if (userProfile.roastMaterial) systemMsg += `\nעקיצה מוכנה: "${userProfile.roastMaterial}"`;
    if (injectedData) systemMsg += `\n${injectedData}`;
    
    const userFacts = userProfile.facts ? userProfile.facts.map(f => f.content).join(". ") : "";
    if (userFacts) systemMsg += `\nעובדות: ${userFacts}`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: text }
            ],
            max_tokens: 100, // קצר כדי לחסוך ב-TTS
            temperature: 0.9 
        });

        const replyText = completion.choices[0]?.message?.content?.trim();
        
        // --- 🗣️ שליחה קולית ---
        if (shouldReplyWithVoice) {
            await sock.sendPresenceUpdate('recording', chatJid); 
            const audioBuffer = await generateVoiceNote(replyText);
            
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mpeg', // ✅ חשוב לוואטסאפ
                    ptt: true // ✅ הופך להודעה קולית
                }, { quoted: msg });
                
                // עדכון המונה היומי
                await incrementVoiceUsage(senderId);
                
                await delay(1000);
                await sock.sendPresenceUpdate('paused', chatJid);
                return; // יצאנו! לא שולחים גם טקסט
            }
        }

        // --- 💬 שליחת טקסט (ברירת מחדל) ---
        await delay(1000); 
        await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        await sock.sendPresenceUpdate('paused', chatJid);

    } catch (error) { console.error('AI Error:', error); }
}

module.exports = { handleMessageLogic };