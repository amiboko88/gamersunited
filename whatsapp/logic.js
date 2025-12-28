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
const GLOBAL_COOLDOWN = 3000; // העליתי קצת כדי למנוע הצפה
let lastBotReplyTime = 0;
const spamTracker = new Map(); 

// 🔥 זיכרון לטווח קצר: מתי שמעון דיבר לאחרונה בכל קבוצה?
// Key: chatJid, Value: timestamp
const activeConversations = new Map();

// מנגנון השכמה (אישור לפני תיוג כולם)
const wakeUpConfirmation = new Map();

// --- מנגנון אנטי-ספאם ---
function checkSpam(userId) {
    const now = Date.now();
    let userData = spamTracker.get(userId) || { count: 0, blockedUntil: 0, lastMsg: 0 };
    if (now < userData.blockedUntil) return { isBlocked: true, shouldAlert: false };
    if (now - userData.lastMsg > 30000) userData.count = 0;
    userData.count++;
    userData.lastMsg = now;
    if (userData.count >= 5) { // קצת יותר סלחן
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

// פונקציה לתיוג כל המשתתפים
async function tagEveryone(sock, chatJid, triggerUser) {
    try {
        const metadata = await sock.groupMetadata(chatJid);
        const participants = metadata.participants.map(p => p.id);
        const text = `📢 **השכמה יא סמרטוטים!**\n${triggerUser} החליט שאתם ישנים.\nקומו לדיסקורד עכשיו!`;
        await sock.sendMessage(chatJid, { text: text, mentions: participants });
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

    // 1. 🖼️ Vision (טיפול בתמונות)
    if (msg.message.imageMessage) {
        const caption = text ? text.toLowerCase() : "";
        if (shouldCheckImage(senderId, caption)) {
            const analysisResult = await handleImageAnalysis(sock, msg, chatJid, senderId, senderName);
            if (analysisResult) {
                // אם שמעון הגיב לתמונה - זה נחשב שהוא "בשיחה"
                activeConversations.set(chatJid, now);
                return;
            }
        }
    }

    if (!text) return;

    // 2. 🛡️ Spam Check
    const spamStatus = checkSpam(senderId);
    if (spamStatus.isBlocked) return; 

    // --- 🚨 מנגנון השכמה ---
    if (wakeUpConfirmation.has(chatJid)) {
        const requestingUser = wakeUpConfirmation.get(chatJid);
        if (senderName === requestingUser && (lowerText.includes('כן') || lowerText.includes('נו') || lowerText.includes('יאללה'))) {
            wakeUpConfirmation.delete(chatJid);
            await tagEveryone(sock, chatJid, senderName);
            activeConversations.set(chatJid, now); // שומר על שיחה ערה
            return;
        }
    }
    if (lowerText.includes('תעיר את כולם') || (lowerText.includes('כולם') && lowerText.includes('לדיסקורד'))) {
        wakeUpConfirmation.set(chatJid, senderName);
        await sock.sendMessage(chatJid, { text: `אתה בטוח יא זין? זה יקפיץ את כולם.\nתגיד "כן" אם אתה גבר.` }, { quoted: msg });
        activeConversations.set(chatJid, now);
        return;
    }

    // 3. 🎲 Roulette (סטיקרים)
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

    // --- 🔥 בדיקת טריגר חכמה (הלב של השיחה הרציפה) ---
    
    let shouldTrigger = false;
    let injectedData = "";
    
    // א. טריגר ישיר (קראו לו בשם)
    if (lowerText.includes('שמעון') || lowerText.includes('shimon')) {
        shouldTrigger = true;
    }
    
    // ב. טריגר הקשרי (Context): אם שמעון דיבר ב-60 שניות האחרונות, הוא מקשיב
    const lastActive = activeConversations.get(chatJid) || 0;
    const isConversationActive = (now - lastActive < 60000); // חלון של דקה

    if (!shouldTrigger && isConversationActive) {
        // אם השיחה פעילה, שמעון יגיב בסיכוי גבוה (70%) להודעות קצרות או שאלות
        // זה מונע ממנו להגיב לכל פיפס, אבל שומר על רצף
        if (Math.random() < 0.7) {
            shouldTrigger = true;
        }
    }

    // ג. טריגרים מיוחדים (כסף, דמג')
    const userProfile = await getUserFullProfile(senderId, senderName);

    if (lowerText.includes('כמה כסף') || lowerText.includes('ארנק')) {
        shouldTrigger = true;
        const balance = userProfile.discordData ? (userProfile.discordData.xp || 0) : 0;
        injectedData = `[הוא שואל על כסף. יש לו ₪${balance}. ${balance < 500 ? 'תרד עליו שהוא עני.' : 'תבקש הלוואה.'}]`;
    }

    const claimedDmg = extractDamageClaim(lowerText);
    if (claimedDmg && claimedDmg > 500) {
        shouldTrigger = true;
        injectedData = isSessionActive() ? `[טוען ל-${claimedDmg} דמג'. דרוש הוכחה!]` : `[טוען ל-${claimedDmg}. אין משחק. תרד עליו.]`;
    }

    if (userProfile.justLinked) {
        shouldTrigger = true;
        injectedData += ` [זיהיתי שזה ${userProfile.discordData.displayName} מדיסקורד! תן לו בראש.]`;
    }

    if (!isGroup) shouldTrigger = true;
    if (!shouldTrigger) return;
    
    // קירור קל למניעת הצפה בתוך שיחה
    if (now - lastBotReplyTime < GLOBAL_COOLDOWN) return;

    lastBotReplyTime = now;
    activeConversations.set(chatJid, now); // עדכון זמן פעילות
    await sock.sendPresenceUpdate('composing', chatJid);

    // --- 🎲 החלטה: קול או טקסט? ---
    const canSendVoice = await checkDailyVoiceLimit(senderId);
    // אם כבר בתוך שיחה, נוריד קצת את הסיכוי לקול כדי לא לחפור (15%)
    const voiceChance = isConversationActive ? 0.15 : 0.25; 
    const shouldReplyWithVoice = Math.random() < voiceChance && canSendVoice;

    // 🔥🔥🔥 הפרומפט הסופי והאגרסיבי 🔥🔥🔥
    let systemMsg = `
    אתה שמעון. ערס ישראלי כבד, עצבני וחסר סבלנות.
    אתה לא בוט שירות! אתה חבר בקבוצה שאין לו כוח לשטויות.
    
    הנחיות קריטיות:
    1. **רצף שיחה:** אם עונים לך, תענה חזרה קצר ולעניין. אל תתחיל נאומים.
    2. **מידע אישי (חובה):** יש לך למטה מידע על המשתמש ("${senderName}"). **תשתמש בזה!**
       - אם זה יוגי -> רד על המניות והניתוקים שלו.
       - אם זה מתן -> רד על המחשב והבאגים.
       - אם זה עמוס -> רד עליו שהוא מכור.
       *אל תמציא סתם ירידות, תשתמש באמת הכואבת מהפרופיל שלו.*
    3. **גסות:** תהיה מגעיל. קלל חופשי (סמרטוט, אפס, קוקסינל, שרמוטה). בלי צנזורה.
    4. **אנושיות:** בלי "אני כאן לעזור". אם אומרים לך "סתום", תגיד "בוא תסתום לי יא גמד".
    `;
    
    if (shouldReplyWithVoice) {
        systemMsg += `\n**שים לב: אתה שולח הודעה קולית!** התשובה חייבת להיות 4-8 מילים גג. חדה כתער. דיבור של רחוב.`;
    }

    if (userProfile.discordData) systemMsg += `\nפרטים עליו: שם=${userProfile.discordData.displayName}`;
    
    // כאן אנחנו מזריקים את ה"זהב" מהקובץ profiles.js
    if (userProfile.roastMaterial) {
        systemMsg += `\n🔥 **נקודת תורפה עליו (תשתמש בזה!):** "${userProfile.roastMaterial}"`;
    }
    
    if (injectedData) systemMsg += `\n${injectedData}`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: text }
            ],
            max_tokens: 150,
            temperature: 1.3 // טמפרטורה גבוהה = יותר יצירתיות, קללות וגיוון
        });

        const replyText = completion.choices[0]?.message?.content?.trim();
        
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