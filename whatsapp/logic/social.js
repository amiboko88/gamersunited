const { OpenAI } = require('openai');
const { generateSystemPrompt } = require('../persona');
const { generateVoiceNote } = require('../handlers/voiceHandler');
const { incrementVoiceUsage } = require('../handlers/profileHandler');
const { generateProfileCard } = require('../handlers/profileRenderer');
const memoryEngine = require('./memory');
const fs = require('fs');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateAiReply(senderName, senderId, context, mood) {
    const roast = await memoryEngine.getRoast(senderName, senderId);
    
    // הוספת הנחיית "אנטי-בוט" חריפה
    const styleInstruction = `
    הנחיות קריטיות לשפה:
    1. דבר עברית "שכונה" (סלנג, קיצורים, בלי מילים גבוהות).
    2. לעולם אל תשתמש במבנה "מי לאחר" או "על הכסף" בצורה עילגת. תגיד "מי שמאחר", "על הכסף".
    3. אם שם המשתמש באנגלית (כמו Amos), כתוב אותו בעברית נכונה (עמוס) ולא פונטית (אמוס).
    4. אל תהיה רשמי. תהיה גס, ישיר, ומצחיק.
    `;

    const systemMsg = generateSystemPrompt(senderName, roast, "", context, `מצב רוח: ${mood}. ${styleInstruction}`);
    
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemMsg }],
        max_tokens: 120, // הגדלתי קצת שיהיה לו מקום להתבטא
        temperature: 1.0 // יצירתיות גבוהה יותר
    });
    return completion.choices[0].message.content;
}

async function handleOfflineInteraction(sock, chatJid, senderName, senderId, reason, text) {
    const reasonText = reason === 'Shabbat' ? 'שבת/חג' : (reason === 'Night' ? 'אמצע הלילה' : 'שנ"צ');
    const reply = await generateAiReply(senderName, senderId, 
        `אתה לא זמין בגלל ${reasonText}. המשתמש כותב: "${text}". תעיף אותו לישון/לבית כנסת.`, 
        "עייף ועצבני"
    );
    await sock.sendMessage(chatJid, { text: reply });
}

async function handleToxicResponse(sock, chatJid, msg, senderId, senderName, text) {
    await sock.sendPresenceUpdate('recording', chatJid);
    const reply = await generateAiReply(senderName, senderId, 
        `המשתמש לכלך עליך: "${text}". כנס בו חזק. רד לפסים אישיים. קלל את האמא/אחות/יכולות משחק שלו.`, 
        "רעיל ואכזרי"
    );
    
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

async function handleHelpRequest(sock, chatJid, msg, senderId, senderName, text) {
    const reply = await generateAiReply(senderName, senderId, 
        `המשתמש שאל שאלה: "${text}". תענה לו כמו "אח גדול" שיודע הכל אבל חסר סבלנות לשאלות קיטבג.`, 
        "עוזר ומנשא"
    );
    await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
}

// 🔥 התיקון הגדול בהזמנות משחק
async function handleGameInvite(sock, chatJid, senderId, senderName, text) {
    let context = "";
    let mood = "";

    // בדיקה אם ההזמנה מכוונת לשמעון אישית
    if (text.includes('אותך') || text.includes('איתי') || text.includes('בא לך') || text.includes('תשחק')) {
        context = `המשתמש הזמין אותך לשחק איתו ("${text}"). תרד עליו שאתה בוט ושאין לך זמן לנובים כמוהו. תגיד לו ללכת לחפש חברים אמיתיים.`;
        mood = "מזלזל";
    } else {
        // הזמנה לקבוצה
        context = `המשתמש מזמין את כולם לשחק. תצרח על כולם להיכנס לדיסקורד ואיים בקנסות למי שמאחר. תהיה מדרבן אבל אגרסיבי.`;
        mood = "מבצעי/רס\"ר";
    }

    const reply = await generateAiReply(senderName, senderId, context, mood);
    await sock.sendMessage(chatJid, { text: reply });
}

async function handleGeneralChat(sock, chatJid, msg, senderId, senderName, text, category) {
    await sock.sendPresenceUpdate('composing', chatJid);
    const mood = category === 'PRAISE' ? "מבסוט רצח (אגו)" : "ציני ומשועמם";
    const reply = await generateAiReply(senderName, senderId, `סתם דיבורים: "${text}". תגיב קצר, בשפה של רחוב.`, mood);
    await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
}

async function celebrateLevelUp(sock, chatJid, senderId, senderName, levelData) {
    const cardPath = await generateProfileCard({
        name: senderName,
        avatarUrl: await sock.profilePictureUrl(chatJid, 'image').catch(() => null),
        messageCount: levelData.totalMessages,
        balance: levelData.reward
    });

    const aiText = await generateAiReply(senderName, senderId, `המשתמש עלה לדרגה ${levelData.rankName}. תן לו בראש שלא יתלהב יותר מדי.`, "חגיגי וציני");
    
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