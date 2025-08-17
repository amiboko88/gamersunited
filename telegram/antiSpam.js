// 📁 telegram/antiSpam.js (שדרוג למערכת מבוססת DB)
const openai = require('../utils/openaiConfig');
const db = require('../utils/firebase');
const { sendStaffLog } = require('../utils/staffLogger');

// הגדרות סף לספאם
const SPAM_CONFIG = {
    FAST_SPAM_TIME_WINDOW_MS: 8000,    // חלון זמן לבדיקת הודעות מהירות (8 שניות)
    FAST_SPAM_MESSAGE_COUNT: 4,        // כמות הודעות בחלון הזמן שתיחשב ספאם
    LINK_SPAM_THRESHOLD: 2,            // כמות קישורים שתיחשב ספאם
    CURSE_SPAM_THRESHOLD: 3,           // כמות קללות שתיחשב ספאם
    SAME_MESSAGE_SPAM_THRESHOLD: 3,    // כמות הודעות זהות שתיחשב ספאם
};

// רשימת קללות מובנית
const defaultCurses = [
  'זין', 'חרא', 'בן זונה', 'כוס', 'כוסית', 'זונה', 'מטומטם', 'מפגר', 'נכה', 'בהמה',
  'אפס', 'פח', 'ילד כאפות', 'סמרטוט', 'שמן', 'מכוער', 'חולה נפש', 'אידיוט', 'עקום', 'עיוור',
  'נבלה', 'חלאה', 'שרמוטה', 'סתום', 'תמות', 'טיפש', 'חרא בן אדם', 'נאצי', 'אנס', 'זי*ן', 'כ*ס',
  'fuck', 'shit', 'bitch', 'dick', 'pussy', 'asshole', 'retard', 'faggot', 'moron', 'jerk',
  'loser', 'idiot', 'stupid', 'whore', 'slut', 'f*ck', 'sh*t', 'c*nt', 'dumb', 'suck',
  'lame', 'douche', 'f@ggot', 'n*gga', 'ret@rd', 'pu$$y', 'cuck', 'אידיוטית', 'קללה',
  'משוגע', 'עלוב', 'שפל', 'דביל', 'סתומה', 'תחת', 'זבל', 'מטונף', 'מזדיין', 'כושי'
];

const SPAM_TRACKING_COLLECTION = 'telegramSpamTracking';

/**
 * מאחזר או יוצר דוקומנט מעקב למשתמש ב-Firestore.
 * @param {number} userId - מזהה המשתמש.
 * @returns {Promise<FirebaseFirestore.DocumentSnapshot>} - סנאפשוט של הדוקומנט.
 */
async function getUserTrackingDoc(userId) {
    const userRef = db.collection(SPAM_TRACKING_COLLECTION).doc(String(userId));
    let userDoc = await userRef.get();
    if (!userDoc.exists) {
        await userRef.set({
            messageHistory: [],
            linkCount: 0,
            curseCount: 0,
            lastMessage: ''
        });
        userDoc = await userRef.get();
    }
    return userDoc;
}

/**
 * הפונקציה הראשית לבדיקת ספאם.
 * @param {import('grammy').Context} ctx - אובייקט הקונטקסט של grammy.
 * @returns {Promise<boolean>} - האם ההודעה היא ספאם.
 */
async function isSpam(ctx) {
    const userId = ctx.from.id;
    const messageText = ctx.message.text || '';
    const now = Date.now();

    const userDoc = await getUserTrackingDoc(userId);
    const userData = userDoc.data();
    const userRef = userDoc.ref;

    // 1. בדיקת ספאם מהיר (הודעות רבות בזמן קצר)
    const newHistory = userData.messageHistory.filter(timestamp => now - timestamp < SPAM_CONFIG.FAST_SPAM_TIME_WINDOW_MS);
    newHistory.push(now);

    if (newHistory.length > SPAM_CONFIG.FAST_SPAM_MESSAGE_COUNT) {
        await handleSpam(ctx, 'fast_spam');
        await userRef.update({ messageHistory: [] }); // איפוס לאחר טיפול
        return true;
    }

    // 2. בדיקת ספאם קישורים
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    const links = messageText.match(linkRegex);
    let currentLinkCount = userData.linkCount || 0;
    if (links && links.length > 0) {
        currentLinkCount += links.length;
        if (currentLinkCount > SPAM_CONFIG.LINK_SPAM_THRESHOLD) {
            await handleSpam(ctx, 'link_spam');
            await userRef.update({ linkCount: 0, messageHistory: newHistory });
            return true;
        }
    }

    // 3. בדיקת ספאם קללות
    const lowerCaseText = messageText.toLowerCase();
    const curseMatches = defaultCurses.filter(curse => lowerCaseText.includes(curse));
    let currentCurseCount = userData.curseCount || 0;
    if (curseMatches.length > 0) {
        currentCurseCount += curseMatches.length;
        if (currentCurseCount > SPAM_CONFIG.CURSE_SPAM_THRESHOLD) {
            await handleSpam(ctx, 'curse_spam');
            await userRef.update({ curseCount: 0, messageHistory: newHistory });
            return true;
        }
    }
    
    // 4. בדיקת הודעות זהות חוזרות
    const recentMessages = newHistory.map(ts => userData.messageHistory.find(m => m.timestamp === ts)?.text).filter(Boolean);
    recentMessages.push(messageText);
    const sameMessagesCount = recentMessages.filter(text => text === messageText).length;

    if (sameMessagesCount > SPAM_CONFIG.SAME_MESSAGE_SPAM_THRESHOLD) {
         await handleSpam(ctx, 'same_message_spam');
         await userRef.update({ messageHistory: [] });
         return true;
    }

    // עדכון הנתונים ב-Firestore בסוף הבדיקה
    await userRef.update({
        messageHistory: newHistory,
        linkCount: currentLinkCount,
        curseCount: currentCurseCount,
        lastMessage: messageText
    });

    return false;
}

/**
 * מטפל בהודעת ספאם - מוחק אותה, שולח תגובה חכמה ומתעד.
 * @param {import('grammy').Context} ctx - אובייקט הקונטקסט של grammy.
 * @param {string} spamType - סוג הספאם שזוהה.
 */
async function handleSpam(ctx, spamType) {
    try {
        await ctx.deleteMessage().catch(e => console.error(`[AntiSpam] Failed to delete spam message: ${e.message}`));

        const spamResponse = await getAntiSpamResponse(spamType);
        await ctx.reply(spamResponse, { parse_mode: 'HTML' });

        const user = ctx.from;
        const chat = ctx.chat;
        const logMessage = `🚨 **ספאם זוהה ומטופל בטלגרם!**\n` +
                           `**משתמש:** ${user.first_name} (@${user.username || user.id})\n` +
                           `**צ'אט:** ${chat.title || chat.type} (ID: ${chat.id})\n` +
                           `**סוג ספאם:** ${spamType.replace('_', ' ')}\n` +
                           `**הודעה מקורית:** \`${ctx.message.text ? ctx.message.text.substring(0, 100) : '[אין טקסט]'}\``;
        
        // שליחת לוג לדיסקורד אם קיים גשר
        await sendStaffLog('🚨 ספאם טלגרם זוהה', logMessage, 0xFF0000);
        
    } catch (error) {
        console.error('❌ שגיאה בטיפול בספאם:', error);
    }
}

/**
 * מייצר תגובה אנטי-ספאם חכמה באמצעות OpenAI.
 * @param {string} spamType - סוג הספאם.
 * @returns {Promise<string>} - התגובה שנוצרה.
 */
async function getAntiSpamResponse(spamType) {
    const prompts = {
        'fast_spam': `משתמש שולח הודעות מהר מדי. הגב בטון עוקצני אך מתוחכם, כאילו אתה מתלונן על הרעש. אל תהיה בוטה.
            דוגמאות: "אפשר להוריד את הווליום, אנחנו עדיין פה.", "הקצב שלך מהיר יותר מהמוח שלי. תאט קצת.", "נראה לי שהמקלדת שלך נתקעה על הילוך חמישי."
            תגובה:`,
        'link_spam': `משתמש שולח הרבה קישורים. הגב בסרקסטיות, כאילו אתה מזהיר אותו מההשלכות או מתלונן על הפרסומות.
            דוגמאות: "תודה על הקישור, אבל אני לא מחפש הלוואה מהירה כרגע.", "האם אתה מנסה למכור לי משהו? כי אני לא קונה.", "אני מניח שאתה מקבל עמלה על כל קישור שאתה שולח."
            תגובה:`,
        'curse_spam': `משתמש מקלל. הגב בטון מתנשא וציני, כאילו אתה מעל השפה הזו. אל תחזיר קללות.
            דוגמאות: "הלקסיקון שלך מרשים... בערך.", "נראה שמישהו שכח את המילים היפות בבית.", "האם זה ניסיון להרשים? כי זה לא עובד."
            תגובה:`,
        'same_message_spam': `משתמש שולח הודעות זהות שוב ושוב. הגב בסרקסטיות על חוסר היצירתיות או על חוסר הטעם.
            דוגמאות: "כבר הבנו, יש לך רק מילה אחת בלקסיקון?", "האם אתה תקוע בלופ? כי אני לא.", "העתק-הדבק זה כל כך 2000 ואחת."
            תגובה:`
    };
    const prompt = prompts[spamType] || 'זוהה ספאם. הגב בטון סרקסטי ועוקצני. תגובה:';

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 50,
            temperature: 0.9,
        });
        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('❌ שגיאה ביצירת תגובת אנטי-ספאם מ-OpenAI:', error);
        const defaultResponses = {
            'fast_spam': 'נראה שאתה ממהר. תאט קצת, אנחנו לא במירוץ.',
            'link_spam': 'תודה על הקישור, אבל אני לא לוחץ על כל דבר.',
            'curse_spam': 'הלקסיקון שלך מרשים... בערך.',
            'same_message_spam': 'כבר הבנו, יש לך רק מילה אחת בלקסיקון?'
        };
        return defaultResponses[spamType] || 'נראה שיש כאן קצת רעש.';
    }
}

module.exports = {
    isSpam,
};