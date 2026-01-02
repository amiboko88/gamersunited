const { OpenAI } = require('openai');
const { generateSystemPrompt } = require('../persona');
const { generateVoiceNote } = require('../handlers/voiceHandler');
const { incrementVoiceUsage } = require('../handlers/profileHandler');
const { generateProfileCard } = require('../handlers/profileRenderer');
const memoryEngine = require('./memory');
const fs = require('fs');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 🎭 המטריצה הרגשית - גרסה מתוקנת ומוקפדת
 */
function determineStyle(mood, sentiment, category) {
    // 🔥 תיקון קריטי: אם המשתמש מבקש עזרה, שוברים דיסטנס ונהיים פרקטיים
    if (category === 'HELP_REQUEST') {
        return `
        🧠 מצב: "האח הגדול שמבין בהכל".
        הוראות:
        1. תן תשובה פרקטית ואמיתית! (שמות של חנויות בישראל: KSP, Ivory, Zap, מחסני חשמל).
        2. אל תמציא חנויות כמו "וידאו" או "ברווז".
        3. תהיה מועיל. תגיד לו איפה בודקים.
        4. הסגנון: "שמע יא גבר, אל תהיה פראייר, כנס לזאפ..."
        `;
    }

    if (sentiment === 'POSITIVE') {
        return `
        🌟 מצב: "אח יקר".
        הוראות: תענה בפרגון, כבוד, מילים חמות (נשמה, מלך). תעשה מה שהוא מבקש.
        `;
    } 
    
    else if (sentiment === 'NEGATIVE') {
        return `
        🔥 מצב: "תקיפה".
        הוראות: כנס בו. סלנג תוקפני, ירידות אישיות, אל תהיה פראייר.
        `;
    }

    else {
        return `
        😐 מצב: "שכונה ענייני".
        הוראות: קצר, קולע, סלנג קליל. בלי חפירות.
        `;
    }
}

async function generateAiReply(senderName, senderId, context, mood, sentiment = 'NEUTRAL', category = 'SOCIAL') {
    const roast = await memoryEngine.getRoast(senderName, senderId);
    
    // קביעת הסגנון לפי הקטגוריה והרגש
    const emotionalInstructions = determineStyle(mood, sentiment, category);

    const baseInstructions = `
    כללי ברזל לשפה:
    1. דבר עברית טבעית (סלנג ישראלי עדכני). אסור להמציא מילים בג'יבריש (כמו "וועלתיסונא").
    2. אם שם המשתמש באנגלית, תכתוב אותו בעברית (Amos -> עמוס).
    3. תהיה חכם. אל תדבר שטויות שלא קשורות לשאלה.
    `;

    const systemMsg = generateSystemPrompt(senderName, roast, "", context, `מצב רוח: ${mood}.\n${emotionalInstructions}\n${baseInstructions}`);
    
    // אם זו בקשת עזרה, נוריד את הטמפרטורה כדי שיהיה מדויק ולא ימציא שטויות
    const temp = category === 'HELP_REQUEST' ? 0.5 : 0.8;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemMsg }],
        max_tokens: 150,
        temperature: temp 
    });
    return completion.choices[0].message.content;
}

// --- הנדלרים ---

async function handleOfflineInteraction(sock, chatJid, senderName, senderId, reason, text) {
    const reasonText = reason === 'Shabbat' ? 'שבת/חג' : (reason === 'Night' ? 'אמצע הלילה' : 'שנ"צ');
    const reply = await generateAiReply(senderName, senderId, 
        `אתה לא זמין (${reasonText}). המשתמש כותב: "${text}".`, 
        "עייף", "NEUTRAL", "SOCIAL"
    );
    await sock.sendMessage(chatJid, { text: reply });
}

async function handleToxicResponse(sock, chatJid, msg, senderId, senderName, text) {
    await sock.sendPresenceUpdate('recording', chatJid);
    const reply = await generateAiReply(senderName, senderId, 
        `המשתמש קילל אותך: "${text}".`, 
        "רעיל", "NEGATIVE", "TRASH_TALK"
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

async function handleHelpRequest(sock, chatJid, msg, senderId, senderName, text, sentiment) {
    // בבקשת עזרה, אנחנו מעבירים את הקטגוריה HELP_REQUEST כדי להפעיל את המצב החכם
    const reply = await generateAiReply(senderName, senderId, 
        `המשתמש שאל: "${text}". תן המלצה אמיתית ופרקטית (חנויות, אתרים, פתרונות). אל תמרח אותו.`, 
        "מומחה", 
        sentiment, 
        "HELP_REQUEST"
    );
    await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
}

async function handleGameInvite(sock, chatJid, senderId, senderName, text, sentiment) {
    let context = "";
    if (text.includes('אותך') || text.includes('איתי')) {
        context = `הזמנה אישית לשחק: "${text}".`;
    } else {
        context = `הזמנה לקבוצה: "${text}".`;
    }
    const reply = await generateAiReply(senderName, senderId, context, "גיימר", sentiment, "GAMING_INVITE");
    await sock.sendMessage(chatJid, { text: reply });
}

async function handleGeneralChat(sock, chatJid, msg, senderId, senderName, text, category, sentiment) {
    await sock.sendPresenceUpdate('composing', chatJid);
    const finalSentiment = category === 'PRAISE' ? 'POSITIVE' : sentiment;
    const reply = await generateAiReply(senderName, senderId, `דיבור כללי: "${text}".`, "זורם", finalSentiment, category);
    await sock.sendMessage(chatJid, { text: reply }, { quoted: msg });
}

async function celebrateLevelUp(sock, chatJid, senderId, senderName, levelData) {
    const cardPath = await generateProfileCard({
        name: senderName,
        avatarUrl: await sock.profilePictureUrl(chatJid, 'image').catch(() => null),
        messageCount: levelData.totalMessages,
        balance: levelData.reward
    });
    const aiText = await generateAiReply(senderName, senderId, `עלה לדרגה ${levelData.rankName}.`, "חגיגי", "POSITIVE", "SOCIAL");
    await sock.sendMessage(chatJid, { 
        image: fs.readFileSync(cardPath),
        caption: `🆙 **LEVEL UP!**\n${aiText}`,
        mentions: [`${senderId}@s.whatsapp.net`]
    });
    try { fs.unlinkSync(cardPath); } catch (e) {}
}

async function sendQuickReply(sock, chatJid, senderId, senderName, context, mood) {
    const reply = await generateAiReply(senderName, senderId, context, mood, "NEUTRAL", "SOCIAL");
    await sock.sendMessage(chatJid, { text: reply });
}

module.exports = { 
    handleToxicResponse, handleHelpRequest, handleGameInvite, 
    handleGeneralChat, celebrateLevelUp, sendQuickReply, handleOfflineInteraction 
};