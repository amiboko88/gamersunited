// ✅ ה-LID שלך (המנהל)
const ADMIN_NUMBER = '100772834480319'; 

const { delay } = require('@whiskeysockets/baileys');
const { Collection } = require('discord.js');
const db = require('../utils/firebase');
const admin = require('firebase-admin');
const { smartRespond } = require('../handlers/smartChat'); 
const { log } = require('../utils/logger');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const COOLDOWN_TIME = 10000; 
const GLOBAL_COOLDOWN = 3000;
const BAD_WORDS = ['מניאק', 'זונה', 'שרמוטה', 'קוקסינל', 'הומו', 'זיין', 'אידיוט', 'טמבל', 'טיפש', 'חרא'];

const userCooldowns = new Map();
let lastBotReplyTime = 0;

// --- 1. הפנקס השחור ---
async function analyzeAndStoreFacts(senderId, senderName, text) {
    if (text.length < 15) return; 

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "תפקידך לזהות אם בהודעה יש פרט מידע אישי, מביך, או חשוב על המשתמש שראוי לזכור לעתיד. אם כן, תחזיר את העובדה במשפט קצר בעברית. אם אין, תחזיר ריק." },
                { role: "user", content: `המשתמש ${senderName} כתב: "${text}"` }
            ],
            max_tokens: 50,
            temperature: 0.3
        });

        const fact = completion.choices[0]?.message?.content?.trim();

        if (fact && fact.length > 5 && !fact.includes("אין")) {
            log(`[WhatsApp] 📝 Black Book entry for ${senderName} (${senderId}): ${fact}`);
            await db.collection('whatsapp_users').doc(senderId).update({
                facts: admin.firestore.FieldValue.arrayUnion({
                    content: fact,
                    timestamp: new Date().toISOString(),
                    originalMessage: text
                })
            });
        }
    } catch (err) {}
}

// --- 2. מודיעין ---
async function updateUserIntelligence(sock, senderId, senderJidForProfile, senderName) {
    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        const doc = await userRef.get();
        const userData = doc.exists ? doc.data() : {};

        const lastUpdate = userData.lastProfileScan ? new Date(userData.lastProfileScan).getTime() : 0;
        const oneDay = 24 * 60 * 60 * 1000;

        if (Date.now() - lastUpdate > oneDay) {
            let profilePicUrl = null;
            try { profilePicUrl = await sock.profilePictureUrl(senderJidForProfile, 'image').catch(() => null); } catch (e) {}

            let statusText = null;
            try {
                const statusData = await sock.fetchStatus(senderJidForProfile).catch(() => null);
                statusText = statusData?.status || null;
            } catch (e) {}

            await userRef.set({
                id: senderId,
                displayName: senderName, 
                profilePic: profilePicUrl || userData.profilePic || null,
                aboutStatus: statusText || userData.aboutStatus || null,
                lastProfileScan: new Date().toISOString(),
                lastMessageAt: new Date().toISOString(),
                messageCount: admin.firestore.FieldValue.increment(1)
            }, { merge: true });
        } else {
            await userRef.update({
                lastMessageAt: new Date().toISOString(),
                messageCount: admin.firestore.FieldValue.increment(1)
            });
        }
        return userData; 
    } catch (err) {
        return {};
    }
}

// --- 3. הלוגיקה הראשית ---
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid; 
    const isGroup = chatJid.endsWith('@g.us');
    
    // זיהוי השולח האמיתי (קריטי לקבוצות!)
    const senderFullJid = isGroup ? (msg.key.participant || msg.participant) : chatJid;
    const senderId = senderFullJid ? senderFullJid.split('@')[0] : 'unknown';

    // בדיקת מנהל (לפי ה-LID)
    const isAdmin = senderId === ADMIN_NUMBER;

    if (!isGroup && !isAdmin) {
        return; 
    }

    const senderName = msg.pushName || "לא ידוע";

    const userData = await updateUserIntelligence(sock, senderId, senderFullJid, senderName);
    analyzeAndStoreFacts(senderId, senderName, text);

    const now = Date.now();
    let shouldTrigger = false;
    let contextType = 'regular';

    const foundBadWord = BAD_WORDS.find(word => text.includes(word));
    if (foundBadWord) {
        if (Math.random() > 0.3) {
            shouldTrigger = true;
            contextType = 'roast';
            log(`[WhatsApp] 🤬 Curse detected from ${senderName}: ${foundBadWord}`);
        }
    }

    if (text.toLowerCase().includes('שמעון') || text.toLowerCase().includes('shimon')) {
        shouldTrigger = true;
        contextType = 'regular';
    }

    if (!shouldTrigger) return;

    if (now - lastBotReplyTime < GLOBAL_COOLDOWN) return;
    if ((now - (userCooldowns.get(senderId) || 0)) < COOLDOWN_TIME) {
        log(`[WhatsApp] ⏳ ${senderName} is on cooldown.`);
        return;
    }

    log(`[WhatsApp] 💬 Replying to ${senderName}`);
    userCooldowns.set(senderId, now);
    lastBotReplyTime = now;

    await sock.sendPresenceUpdate('composing', chatJid);
    await delay(1500);

    const finalDisplayName = userData.nickname || senderName;
    const userFacts = userData.facts ? userData.facts.map(f => f.content).join(". ") : "";

    let systemInstruction = "";
    if (userFacts) {
        systemInstruction += ` [מידע מודיעיני: ${userFacts}. השתמש בזה כדי לרדת עליו.]`;
    }

    let processedText = text + systemInstruction;
    if (contextType === 'roast') {
        processedText = `(המשתמש קילל, תגיב לו בצורה עוקצנית): ${text} ${systemInstruction}`;
    }

    const fakeDiscordMessage = {
        content: processedText,
        author: { id: senderId, username: senderName, bot: false },
        member: { 
            displayName: finalDisplayName, 
            permissions: { has: () => false }, 
            roles: { cache: new Collection() } 
        },
        channel: { id: 'whatsapp_dm', messages: { fetch: async () => new Collection() }, sendTyping: async () => {} },
        attachments: new Collection(),
        mentions: { has: () => true },
        reply: async (response) => {
            const replyText = typeof response === 'string' ? response : response.content;
            
            // שולח תשובה ל-chatJid (הקבוצה או הפרטי) עם ציטוט נקי
            await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
            
            await sock.sendPresenceUpdate('paused', chatJid);
        }
    };

    try {
        await smartRespond(fakeDiscordMessage, true);
    } catch (error) {
        console.error('WhatsApp SmartChat Error:', error);
    }
}

module.exports = { handleMessageLogic };