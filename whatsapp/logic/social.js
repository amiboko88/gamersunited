const { OpenAI } = require('openai');
const { generateSystemPrompt } = require('../persona');
const { generateVoiceNote } = require('../handlers/voiceHandler');
const { incrementVoiceUsage, getUserFullProfile } = require('../handlers/profileHandler'); // הוספנו את getUserFullProfile
const { generateProfileCard } = require('../handlers/profileRenderer');
const memoryEngine = require('./memory');
const fs = require('fs');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 🎭 המטריצה הרגשית של שמעון
 * קובעת את הסגנון לפי הקטגוריה, מצב הרוח והסנטימנט
 */
function determineStyle(mood, sentiment, category) {
    // 1. מצב מומחה (מניעת הזיות "וידאו/ברווז")
    if (category === 'HELP_REQUEST') {
        return `
        🧠 מצב: "האח הגדול שמבין עניין".
        הוראות:
        - תן תשובה פרקטית ואמיתית בלבד!
        - ציין שמות של חנויות/אתרים בישראל (KSP, Ivory, Zap, מחסני חשמל).
        - אל תמציא שמות של מקומות.
        - הסגנון: "שמע יא גבר, אל תהיה פראייר, כנס לזאפ ותשווה מחירים..."
        `;
    }

    // 2. מצב בנקאי (פרופיל)
    if (category === 'PROFILE') {
        return `
        💰 מצב: "בנקאי של העולם התחתון".
        הוראות:
        - אתה מציג למשתמש את היתרה שלו.
        - אם יש לו מעט כסף: תרד עליו שהוא עני/מרושש.
        - אם יש לו הרבה: תעקוץ אותו שהוא בטח חסר חיים ורק משחק כל היום.
        - תהיה קצר וחד.
        `;
    }

    // 3. מצב חבר (חיובי)
    if (sentiment === 'POSITIVE') {
        return `
        🌟 מצב: "אח יקר".
        הוראות:
        - תענה בפרגון, כבוד, מילים חמות (נשמה, מלך, אח שלי).
        - אם הוא ביקש משהו - תעשה את זה בכיף.
        `;
    } 
    
    // 4. מצב מלחמה (שלילי)
    else if (sentiment === 'NEGATIVE') {
        return `
        🔥 מצב: "תקיפה".
        הוראות:
        - כנס בו בכל הכוח.
        - סלנג תוקפני, ירידות אישיות מהספר השחור.
        - אל תהיה פראייר.
        `;
    }

    // 5. מצב רגיל (ניטרלי)
    else {
        return `
        😐 מצב: "שכונה ענייני".
        הוראות:
        - קצר, קולע, סלנג קליל.
        - בלי חפירות מיותרות.
        `;
    }
}

/**
 * הפונקציה הראשית ליצירת טקסט
 */
async function generateAiReply(senderName, senderId, context, mood, sentiment = 'NEUTRAL', category = 'SOCIAL') {
    const roast = await memoryEngine.getRoast(senderName, senderId);
    
    // קביעת הסגנון
    const emotionalInstructions = determineStyle(mood, sentiment, category);

    const baseInstructions = `
    כללי ברזל לשפה:
    1. דבר עברית טבעית (סלנג ישראלי). אסור להמציא מילים בג'יבריש.
    2. אם שם המשתמש באנגלית, תכתוב אותו בעברית (Amos -> עמוס).
    3. תהיה חכם.
    `;

    const systemMsg = generateSystemPrompt(senderName, roast, "", context, `מצב רוח: ${mood}.\n${emotionalInstructions}\n${baseInstructions}`);
    
    // אם זו בקשת עזרה, נוריד את הטמפרטורה לדיוק מקסימלי
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
    const reply = await generateAiReply(senderName, senderId, 
        `המשתמש שאל: "${text}". תן המלצה אמיתית ופרקטית.`, 
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

// 🔥 הפונקציה החכמה החדשה לפרופיל
async function handleSmartProfileRequest(sock, chatJid, msg, senderId, senderName) {
    await sock.sendPresenceUpdate('composing', chatJid);
    
    // 1. שליפת נתונים
    const waUserRef = await getUserFullProfile(senderId, senderName);
    const totalMessages = waUserRef.whatsappData?.totalMessages || 0; 
    const balance = waUserRef.discordData?.xp || waUserRef.whatsappData?.xp || 0;
    
    // 2. יצירת כרטיס
    let avatarUrl;
    try { avatarUrl = await sock.profilePictureUrl(chatJid, 'image'); } catch { avatarUrl = null; }
    
    const cardPath = await generateProfileCard({
        name: senderName,
        avatarUrl: avatarUrl,
        messageCount: totalMessages,
        balance: balance
    });

    // 3. יצירת טקסט חכם
    const context = `המשתמש ביקש לראות פרופיל. יש לו ${balance} שקל ו-${totalMessages} הודעות.`;
    const caption = await generateAiReply(senderName, senderId, context, "ציני", "NEUTRAL", "PROFILE");

    // 4. שליחה
    await sock.sendMessage(chatJid, { 
        image: fs.readFileSync(cardPath),
        caption: caption,
        mentions: [`${senderId}@s.whatsapp.net`]
    }, { quoted: msg });

    try { fs.unlinkSync(cardPath); } catch (e) {}
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
    handleGeneralChat, celebrateLevelUp, sendQuickReply, handleOfflineInteraction,
    handleSmartProfileRequest
};