const { OpenAI } = require('openai');
const { generateSystemPrompt } = require('../persona'); // האישיות
const { generateVoiceNote } = require('../handlers/voiceHandler');
const { incrementVoiceUsage } = require('../handlers/profileHandler');
const { generateProfileCard } = require('../handlers/profileRenderer');
const memoryEngine = require('./memory');
const fs = require('fs');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// פונקציית ליבה שמייצרת תשובה (מחברת את הכל)
async function generateAiReply(senderName, senderId, context, mood) {
    const roast = await memoryEngine.getRoast(senderName, senderId);
    const systemMsg = generateSystemPrompt(senderName, roast, "", context, `מצב רוח נוכחי: ${mood}`);
    
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // מודל מהיר
        messages: [{ role: "system", content: systemMsg }],
        max_tokens: 100,
        temperature: 0.9
    });
    return completion.choices[0].message.content;
}

async function handleOfflineInteraction(sock, chatJid, senderName, senderId, reason, text) {
    const reasonText = reason === 'Shabbat' ? 'שבת/חג' : (reason === 'Night' ? 'אמצע הלילה' : 'שנ"צ');
    
    const context = `
    אתה כרגע לא זמין. הסיבה: ${reasonText}.
    המשתמש ${senderName} מפריע לך וכותב: "${text}".
    תעיף אותו בצורה מצחיקה/עצבנית. אל תעזור לו.
    `;
    
    const reply = await generateAiReply(senderName, senderId, context, "עייף ועצבני");
    await sock.sendMessage(chatJid, { text: reply });
}

async function handleToxicResponse(sock, chatJid, msg, senderId, senderName, text) {
    await sock.sendPresenceUpdate('recording', chatJid);
    const reply = await generateAiReply(senderName, senderId, `המשתמש קילל או לכלך: "${text}". תן לו בראש, הכי גס שיש.`, "רעיל ואכזרי");
    
    // סיכוי גבוה לוויס
    if (Math.random() < 0.8) {
        const audioBuffer = await generateVoiceNote(reply);
        if (audioBuffer) {
            await sock.sendMessage(chatJid, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
            await incrementVoiceUsage(senderId);
            return;
        }
    }
    await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
}

// 🔥 תוקן: הוספנו את msg
async function handleHelpRequest(sock, chatJid, msg, senderId, senderName, text) {
    const reply = await generateAiReply(senderName, senderId, `המשתמש ביקש עזרה: "${text}". תעזור לו אבל בסגנון של "אח גדול" שיודע הכל ומנחית הוראות.`, "עוזר ומנשא");
    await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
}

async function handleGameInvite(sock, chatJid, senderId, senderName) {
    const reply = await generateAiReply(senderName, senderId, `המשתמש מזמין למשחק. תזרז את כולם להכנס לדיסקורד ואיים בקנסות למי שמאחר.`, "מבצעי");
    await sock.sendMessage(chatJid, { text: reply });
}

// 🔥 תוקן: הוספנו את msg
async function handleGeneralChat(sock, chatJid, msg, senderId, senderName, text, category) {
    await sock.sendPresenceUpdate('composing', chatJid);
    const mood = category === 'PRAISE' ? "מבסוט מעצמי (אגו בשמיים)" : "ציני ומשועמם";
    const reply = await generateAiReply(senderName, senderId, `סתם דיבורים: "${text}". תגיב קצר.`, mood);
    await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
}

async function celebrateLevelUp(sock, chatJid, senderId, senderName, levelData) {
    const cardPath = await generateProfileCard({
        name: senderName,
        avatarUrl: await sock.profilePictureUrl(chatJid, 'image').catch(() => null),
        messageCount: levelData.totalMessages,
        balance: levelData.reward
    });

    const aiText = await generateAiReply(senderName, senderId, `המשתמש עלה לדרגה ${levelData.rankName} וקיבל ${levelData.reward}.`, "חגיגי וציני");
    
    await sock.sendMessage(chatJid, { 
        image: fs.readFileSync(cardPath),
        caption: `🆙 **LEVEL UP!**\n${aiText}`,
        mentions: [`${senderId}@s.whatsapp.net`]
    });
    try { fs.unlinkSync(cardPath); } catch (e) {}
}

async function sendQuickReply(sock, chatJid, senderId, senderName, context, mood) {
    const reply = await generateAiReply(senderName, senderId, context, mood);
    await sock.sendMessage(chatJid, { text: reply });
}

module.exports = { 
    handleToxicResponse, 
    handleHelpRequest, 
    handleGameInvite, 
    handleGeneralChat, 
    celebrateLevelUp, 
    sendQuickReply,
    handleOfflineInteraction 
};