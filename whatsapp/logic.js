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

// 🔥 זיכרון לטווח קצר
const activeConversations = new Map();
// אישור השכמה
const wakeUpConfirmation = new Map();

// קללות טריגר
const TRIGGER_CURSES = ['סתום', 'שקט', 'אפס', 'מניאק', 'שרמוטה', 'הומו', 'קוקסינל', 'זדיין', 'זין', 'חופר', 'שתוק', 'מעפן', 'חלש'];

// --- אנטי ספאם ---
function checkSpam(userId) {
    const now = Date.now();
    let userData = spamTracker.get(userId) || { count: 0, blockedUntil: 0, lastMsg: 0 };
    if (now < userData.blockedUntil) return { isBlocked: true, shouldAlert: false };
    if (now - userData.lastMsg > 30000) userData.count = 0;
    userData.count++;
    userData.lastMsg = now;
    if (userData.count >= 5) {
        userData.blockedUntil = now + 60000;
        spamTracker.set(userId, userData);
        return { isBlocked: true, shouldAlert: true };
    }
    spamTracker.set(userId, userData);
    return { isBlocked: false, shouldAlert: false };
}

function extractDamageClaim(text) {
    if (text.includes('דמג') || text.includes('נזק') || text.includes('dmg')) {
        const match = text.match(/(\d{3,})/); 
        if (match) return parseInt(match[1]);
    }
    return null;
}

// --- ✅ פונקציית התיוג המעודכנת (@ALL) ---
async function tagEveryone(sock, chatJid, triggerUser) {
    try {
        const metadata = await sock.groupMetadata(chatJid);
        const participants = metadata.participants.map(p => p.id);
        
        // הטקסט כולל @ALL כפי שביקשת
        const text = `📢 **השכמה יא סמרטוטים!** @ALL\n${triggerUser} החליט שאתם ישנים.\nקומו לדיסקורד עכשיו!`;
        
        // חובה לשלוח את mentions כדי שזה באמת יצפצף לכולם
        await sock.sendMessage(chatJid, { 
            text: text, 
            mentions: participants 
        });
    } catch (err) { console.error('Tag Error', err); }
}

// --- הלוגיקה הראשית ---
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid; 
    const isGroup = chatJid.endsWith('@g.us');
    const senderFullJid = isGroup ? (msg.key.participant || msg.participant) : chatJid;
    const senderId = senderFullJid ? senderFullJid.split('@')[0] : 'unknown';
    const isAdmin = senderId === ADMIN_NUMBER;

    if (!isGroup && !isAdmin) return; 

    const senderName = msg.pushName || "האפס התורן";
    const lowerText = text.trim().toLowerCase();
    const now = Date.now();

    // 1. 🖼️ Vision
    if (msg.message.imageMessage) {
        const caption = text ? text.toLowerCase() : "";
        if (shouldCheckImage(senderId, caption)) {
            const analysisResult = await handleImageAnalysis(sock, msg, chatJid, senderId, senderName);
            if (analysisResult) {
                activeConversations.set(chatJid, now);
                return;
            }
        }
    }

    if (!text) return;

    // 2. 🛡️ Spam
    const spamStatus = checkSpam(senderId);
    if (spamStatus.isBlocked) return; 

    // --- 🚨 מנגנון השכמה עם @ALL ---
    if (wakeUpConfirmation.has(chatJid)) {
        const requestingUser = wakeUpConfirmation.get(chatJid);
        if (senderName === requestingUser && (lowerText.includes('כן') || lowerText.includes('נו') || lowerText.includes('יאללה') || lowerText.includes('תעיר'))) {
            wakeUpConfirmation.delete(chatJid);
            await tagEveryone(sock, chatJid, senderName);
            activeConversations.set(chatJid, now);
            return;
        }
    }
    // זיהוי בקשה להעיר
    if (lowerText.includes('תעיר את כולם') || (lowerText.includes('כולם') && lowerText.includes('לדיסקורד')) || lowerText.includes('@all')) {
        wakeUpConfirmation.set(chatJid, senderName);
        await sock.sendMessage(chatJid, { text: `אתה בטוח יא זין? זה יקפיץ את כולם עם @ALL.\nתגיד "כן" אם אתה גבר.` }, { quoted: msg });
        activeConversations.set(chatJid, now);
        return;
    }

    // 3. 🎲 Roulette
    if (lowerText === 'שמעון' || lowerText === 'shimon') {
        const rouletteHandled = await handleShimonRoulette(sock, chatJid);
        if (rouletteHandled) {
            activeConversations.set(chatJid, now);
            return; 
        }
    }

    // 4. 🎙️ פקודת "דבר"
    if (lowerText.startsWith('דבר ')) {
        const textToSpeak = text.substring(4).trim();
        if (textToSpeak.length > 2) {
            await sock.sendPresenceUpdate('recording', chatJid);
            const audioBuffer = await generateVoiceNote(textToSpeak);
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                activeConversations.set(chatJid, now);
                return;
            }
        }
    }

    // 5. 💰 Casino
    if (lowerText.includes('שים') && lowerText.includes('על')) {
        const betResponse = await placeBet(senderId, senderName, lowerText);
        if (betResponse) {
            await sock.sendMessage(chatJid, { text: betResponse }, { quoted: msg });
            activeConversations.set(chatJid, now);
            return; 
        }
    }

    // --- 🔥 מנגנון שיחה חכמה ---
    let shouldTrigger = false;
    let injectedData = "";
    
    // זיהוי ישיר
    if (lowerText.includes('שמעון') || lowerText.includes('shimon')) shouldTrigger = true;
    
    // זיהוי הקשר (רצף שיחה)
    const lastActive = activeConversations.get(chatJid) || 0;
    const isConversationActive = (now - lastActive < 60000); 

    if (isConversationActive) {
        const hasCurse = TRIGGER_CURSES.some(curse => lowerText.includes(curse));
        if (hasCurse) {
            shouldTrigger = true; 
            injectedData += ` [המשתמש קילל אותך באמצע שיחה ("${text}"). כנס בו חזק! אסור לשתוק לו.]`;
        } else if (Math.random() < 0.7) {
            shouldTrigger = true;
        }
    }

    // כסף
    const userProfile = await getUserFullProfile(senderId, senderName);
    if (lowerText.includes('כמה כסף') || lowerText.includes('ארנק')) {
        shouldTrigger = true;
        const balance = userProfile.discordData ? (userProfile.discordData.xp || 0) : 0;
        injectedData = `[שאל על כסף. יתרה: ₪${balance}.]`;
    }

    // דמג' - כאן השימוש ב-addClaimToQueue
    const claimedDmg = extractDamageClaim(lowerText);
    if (claimedDmg && claimedDmg > 500) {
        shouldTrigger = true;
        if (isSessionActive()) {
            addClaimToQueue(senderId, claimedDmg); // ✅ הנה השימוש בפונקציה
            injectedData = `[טוען ל-${claimedDmg} דמג'. דרוש הוכחה!]`;
        } else {
            injectedData = `[טוען ל-${claimedDmg}. אין משחק פעיל.]`;
        }
    }
    else if (lowerText.includes('רשימה') || lowerText.includes('פעילים')) shouldTrigger = true;
    else if (lowerText.includes('שמעון') || lowerText.includes('shimon')) shouldTrigger = true;
    else if (userProfile.justLinked) {
        shouldTrigger = true;
        injectedData += ` [זיהיתי שזה ${userProfile.discordData.displayName} מדיסקורד! תן בראש.]`;
    }

    if (!isGroup) shouldTrigger = true;
    if (!shouldTrigger) return;
    
    if (now - lastBotReplyTime < GLOBAL_COOLDOWN) return;

    lastBotReplyTime = now;
    activeConversations.set(chatJid, now);
    await sock.sendPresenceUpdate('composing', chatJid);

    // --- 🎲 קול או טקסט? ---
    const canSendVoice = await checkDailyVoiceLimit(senderId);
    const voiceChance = isConversationActive ? 0.15 : 0.25; 
    const shouldReplyWithVoice = Math.random() < voiceChance && canSendVoice;

    // 🔥🔥🔥 המוח: הספר השחור + גסות 🔥🔥🔥
    let systemMsg = `
    אתה שמעון. ערס ישראלי כבד, עצבני וחסר סבלנות.
    
    הנחיות:
    1. **אגרסיביות:** אם מישהו מקלל או מזלזל - תתקוף חזרה פי 2. אל תהיה פראייר.
    2. **הספר השחור:** אם המשתמש חושף פרט חדש (רכב, דירה, חברה, יום הולדת) - תשמור אותו!
       הוסף בסוף: {{FACT: המידע החדש}}.
    3. **שפה:** קללות חופשי (זין, שרמוטה, קוקסינל, סמרטוט).
    `;
    
    if (shouldReplyWithVoice) {
        systemMsg += `\n**הודעה קולית!** תהיה קצר ורע. מקסימום 2 משפטים.`;
    }

    if (userProfile.discordData) systemMsg += `\nמולך: ${userProfile.discordData.displayName}`;
    
    const allKnowledge = [
        ...(userProfile.facts ? userProfile.facts.map(f => f.content) : []),
        (userProfile.roastMaterial ? userProfile.roastMaterial : "")
    ].filter(Boolean).join(". ");
    
    if (allKnowledge) systemMsg += `\n🔥 **חומר עליו:** ${allKnowledge}`;
    if (injectedData) systemMsg += `\n${injectedData}`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: text }
            ],
            max_tokens: 200,
            temperature: 1.3 
        });

        let replyText = completion.choices[0]?.message?.content?.trim();
        
        // --- 📝 למידה (הספר השחור) ---
        const factMatch = replyText.match(/{{FACT:\s*(.*?)}}/);
        if (factMatch) {
            const newFact = factMatch[1];
            await addFact(senderId, newFact);
            log(`[BlackBook] 📓 Learned: ${newFact}`);
            replyText = replyText.replace(factMatch[0], "").trim();
        }

        // --- 🗣️ קול ---
        if (shouldReplyWithVoice) {
            await sock.sendPresenceUpdate('recording', chatJid); 
            const audioBuffer = await generateVoiceNote(replyText);
            
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mpeg', 
                    ptt: true 
                }, { quoted: msg });
                
                await incrementVoiceUsage(senderId);
                await delay(1000);
                await sock.sendPresenceUpdate('paused', chatJid);
                return;
            }
        }

        // --- 💬 טקסט ---
        await delay(1000); 
        await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        await sock.sendPresenceUpdate('paused', chatJid);

    } catch (error) { console.error('AI Error:', error); }
}

module.exports = { handleMessageLogic };