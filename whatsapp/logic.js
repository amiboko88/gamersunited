// ✅ ה-LID שלך (המנהל)
const ADMIN_NUMBER = '100772834480319'; 

const { delay } = require('@whiskeysockets/baileys');
const db = require('../utils/firebase');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { OpenAI } = require('openai');
const path = require('path');
const fs = require('fs');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GLOBAL_COOLDOWN = 2000; 
let lastBotReplyTime = 0;
const spamTracker = new Map(); 

// --- נכסים לרולטה של שמעון ---
const SHIMON_ASSETS = {
    sticker: path.join(__dirname, '../assets/shimon_logo.webp'), 
    gifs: [
        'https://media.giphy.com/media/l0HlCqV35hdEg2LS0/giphy.mp4', // סמרטוט
        'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.mp4', // נוב
        'https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.mp4', // חתול מקליד
        'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.mp4'  // מישהו מחכה
    ]
};

// --- רולטה: תגובה רנדומלית לשם "שמעון" ---
async function handleShimonRoulette(sock, chatJid, msg) {
    const rand = Math.random(); 
    log(`[Roulette] Rolling dice... result: ${rand.toFixed(2)}`);

    // 30% סטיקר לוגו
    if (rand < 0.3) {
        if (fs.existsSync(SHIMON_ASSETS.sticker)) {
            await sock.sendMessage(chatJid, { sticker: { url: SHIMON_ASSETS.sticker } });
            return true;
        }
    }
    // 30% גיף רנדומלי
    else if (rand < 0.6) {
        const randomGif = SHIMON_ASSETS.gifs[Math.floor(Math.random() * SHIMON_ASSETS.gifs.length)];
        await sock.sendMessage(chatJid, { video: { url: randomGif }, gifPlayback: true });
        return true;
    }
    // 40% טקסט (ממשיך ל-AI)
    return false; 
}

// --- מנוע זיהוי אוטומטי (Auto-Discovery) ---
async function attemptAutoLinking(senderId, waDisplayName) {
    if (!waDisplayName || waDisplayName.length < 2) return null;
    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) return null;

        let foundDoc = null;
        for (const doc of usersSnapshot.docs) {
            const data = doc.data();
            const discordName = (data.displayName || data.username || "").toLowerCase();
            const whatsappName = waDisplayName.toLowerCase();

            // בדיקת התאמה: שוויון או הכלה (אם השם ארוך מ-3 תווים)
            if (discordName === whatsappName || 
               (discordName.includes(whatsappName) && whatsappName.length > 3) ||
               (whatsappName.includes(discordName) && discordName.length > 3)) {
                foundDoc = doc;
                break;
            }
        }

        if (foundDoc) {
            log(`[Auto-Link] ✅ Match found! WhatsApp: "${waDisplayName}" -> Discord: "${foundDoc.data().displayName}"`);
            await db.collection('whatsapp_users').doc(senderId).set({
                discordId: foundDoc.id,
                isLinked: true,
                linkedAt: new Date().toISOString(),
                displayName: waDisplayName
            }, { merge: true });
            return foundDoc.data();
        }
    } catch (error) { console.error("Auto-Link Error:", error); }
    return null;
}

// --- סטטיסטיקה ---
async function getTopGrinders() {
    try {
        const snapshot = await db.collection('users').orderBy('xp', 'desc').limit(7).get();
        if (snapshot.empty) return "אין נתונים.";
        let report = "📊 **כרישי ה-XP:**\n";
        snapshot.forEach((doc, index) => {
            const d = doc.data();
            report += `${index + 1}. ${d.displayName || 'פלוני'} - רמה ${d.level || 1}\n`;
        });
        return report;
    } catch (error) { return null; }
}

// --- אישיות ---
const SHIMON_PERSONA = `
אתה שמעון. בוט וואטסאפ ישראלי, "ערס" צעצוע, קצר רוח וחד.
החוקים שלך:
1. **סגנון:** סלנג כבד, קצר ולעניין (עד 15 מילים).
2. **רק השם שלך:** אם המשתמש כתב רק "שמעון" וזה הגיע אליך - תגיב ב"מה?" או "דבר" או עקיצה.
3. **מידע:** תן מידע אם מבקשים (רשימות/דמג'), אבל תתלונן.
`;

// --- אנטי ספאם ---
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

// --- פרופיל משתמש ---
async function getUserFullProfile(senderId, senderName) {
    let profile = { waName: senderName, discordData: null, facts: [], justLinked: false };
    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        let doc = await userRef.get();
        let data = doc.exists ? doc.data() : {};

        // בדיקה אם לא מקושר -> נסה לחבר
        if (!data.discordId) {
            const linkedData = await attemptAutoLinking(senderId, senderName);
            if (linkedData) {
                profile.discordData = linkedData;
                profile.justLinked = true;
                data = { facts: data.facts || [] }; 
            }
        } else {
            const discordDoc = await db.collection('users').doc(data.discordId).get();
            if (discordDoc.exists) profile.discordData = discordDoc.data();
        }
        
        profile.facts = data.facts || [];
        await userRef.set({ id: senderId, displayName: senderName, lastMessageAt: new Date().toISOString() }, { merge: true });
    } catch (e) {}
    return profile;
}

// --- הלוגיקה הראשית ---
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid; 
    const isGroup = chatJid.endsWith('@g.us');
    const senderFullJid = isGroup ? (msg.key.participant || msg.participant) : chatJid;
    const senderId = senderFullJid ? senderFullJid.split('@')[0] : 'unknown';
    const isAdmin = senderId === ADMIN_NUMBER;

    if (!isGroup && !isAdmin) return; 

    // הגנה מחפירות
    const spamStatus = checkSpam(senderId);
    if (spamStatus.isBlocked) {
        if (spamStatus.shouldAlert) await sock.sendMessage(chatJid, { text: "שחרר, אתה בחסימה. סע." }, { quoted: msg });
        return; 
    }

    const senderName = msg.pushName || "לא ידוע";
    const lowerText = text.trim().toLowerCase();
    
    // 🎲 רולטה: רק השם "שמעון"
    if (lowerText === 'שמעון' || lowerText === 'shimon') {
        const rouletteHandled = await handleShimonRoulette(sock, chatJid, msg);
        if (rouletteHandled) return; // יצא סטיקר/גיף
        // אם יצא false - ממשיכים ל-AI לתגובה טקסטואלית
    }

    const userProfile = await getUserFullProfile(senderId, senderName);
    const now = Date.now();
    let shouldTrigger = false;
    let injectedData = ""; 

    if (lowerText.includes('רשימה') || lowerText.includes('פעילים') || lowerText.includes('דירוג')) {
        injectedData = await getTopGrinders(); 
        shouldTrigger = true;
    }
    else if (lowerText.includes('שמעון') || lowerText.includes('shimon')) {
        shouldTrigger = true;
    }
    else if ((lowerText.includes('דמג') || lowerText.includes('נזק')) && /\d{3,}/.test(text)) {
        shouldTrigger = true;
        injectedData = "[דיווח נזק WARZONE. פרגן או רד עליו.]";
    }

    // הודעה מיוחדת לזיהוי ראשוני
    if (userProfile.justLinked) {
        shouldTrigger = true;
        injectedData += ` [הודעת מערכת: זיהיתי עכשיו שזה ${userProfile.discordData.displayName} מדיסקורד! תן עקיצה.]`;
    }

    if (!isGroup) shouldTrigger = true;
    if (!shouldTrigger) return;
    if (now - lastBotReplyTime < GLOBAL_COOLDOWN) return;

    lastBotReplyTime = now;
    await sock.sendPresenceUpdate('composing', chatJid);

    let systemMsg = SHIMON_PERSONA;
    if (userProfile.discordData) {
        const d = userProfile.discordData;
        systemMsg += `\n\n💡 מולך עומד "${d.displayName}" מדיסקורד. רמה: ${d.level}.`;
    }
    if (injectedData) systemMsg += `\n\n📌 מידע: ${injectedData}`;
    const userFacts = userProfile.facts ? userProfile.facts.map(f => f.content).join(". ") : "";
    if (userFacts) systemMsg += `\n\nעובדות: ${userFacts}`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: text }
            ],
            max_tokens: 150,
            temperature: 0.9 
        });

        const replyText = completion.choices[0]?.message?.content?.trim();
        await delay(1000); 
        await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        await sock.sendPresenceUpdate('paused', chatJid);

    } catch (error) { console.error('AI Error:', error); }
}

module.exports = { handleMessageLogic };