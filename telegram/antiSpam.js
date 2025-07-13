// 📁 telegram/antiSpam.js (מעודכן: תיקון שגיאות reply_to_message_id ו-sendStaffLog)
const openai = require('../utils/openaiConfig');
const db = require('../utils/firebase');

const SPAM_THRESHOLD_TIME = 5000; // 5 שניות
const SPAM_THRESHOLD_COUNT = 3; // 3 הודעות
const SPAM_LINK_THRESHOLD = 2; // 2 קישורים
const SPAM_CURSE_THRESHOLD = 3; // 3 קללות
const SPAM_SAME_MESSAGE_THRESHOLD = 3; // 3 הודעות זהות

const userMessageHistory = new Map(); // userId -> [{ timestamp, text }]
const userLinkCount = new Map(); // userId -> count
const userCurseCount = new Map(); // userId -> count

// ✅ אין צורך להגדיר STAFF_CHANNEL_ID כאן אם sendStaffLog משמש
const { sendStaffLog: discordSendStaffLog } = require('../utils/staffLogger'); // ייבוא עם שם שונה כדי למנוע התנגשות

// רשימת קללות בסיסית (אם אין קובץ חיצוני)
const defaultCurses = [
  'זין', 'חרא', 'בן זונה', 'כוס', 'כוסית', 'זונה', 'מטומטם', 'מפגר', 'נכה', 'בהמה',
  'אפס', 'פח', 'ילד כאפות', 'סמרטוט', 'שמן', 'מכוער', 'חולה נפש', 'אידיוט', 'עקום', 'עיוור',
  'נבלה', 'חלאה', 'שרמוטה', 'סתום', 'תמות', 'טיפש', 'חרא בן אדם', 'נאצי', 'אנס', 'זי*ן', 'כ*ס',
  'fuck', 'shit', 'bitch', 'dick', 'pussy', 'asshole', 'retard', 'faggot', 'moron', 'jerk',
  'loser', 'idiot', 'stupid', 'whore', 'slut', 'f*ck', 'sh*t', 'c*nt', 'dumb', 'suck',
  'lame', 'douche', 'f@ggot', 'n*gga', 'ret@rd', 'pu$$y', 'cuck', 'אידיוטית', 'קללה',
  'משוגע', 'עלוב', 'שפל', 'דביל', 'סתומה', 'תחת', 'זבל', 'מטונף', 'מזדיין', 'כושי',
  'ערבי מסריח', 'רוסי זבל', 'אשכנזי מסריח', 'מרוקאי חמום', 'אתיופי טיפש',
  'חצי בן אדם', 'מושתן', 'דפוק', 'קשקשן', 'חפרן', 'מזבלה', 'רפש', 'שאריות',
  'שטן', 'קללה רב מערכתית', 'ילד חרא', 'לא יוצלח', 'נודניק', 'שקרן', 'אנס סדרתי'
];


/**
 * בודק אם הודעה היא ספאם.
 * @param {import('grammy').Context} ctx - אובייקט הקונטקסט של grammy.
 * @returns {Promise<boolean>} - האם ההודעה היא ספאם.
 */
async function isSpam(ctx) {
    const message = ctx.message;
    const userId = message.from.id;
    const chatId = message.chat.id; // ✅ המשתנה הזה קיים בשימוש, כפי שדנו קודם.
    const messageText = message.text || '';
    const now = Date.now();

    // 1. בדיקת ספאם מהיר (הודעות רבות בזמן קצר)
    if (!userMessageHistory.has(userId)) {
        userMessageHistory.set(userId, []);
    }
    const history = userMessageHistory.get(userId);
    history.push({ timestamp: now, text: messageText });

    userMessageHistory.set(userId, history.filter(msg => now - msg.timestamp < SPAM_THRESHOLD_TIME));

    if (userMessageHistory.get(userId).length > SPAM_THRESHOLD_COUNT) {
        await handleSpam(ctx, 'fast_spam');
        return true;
    }

    // 2. בדיקת ספאם קישורים
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    const links = messageText.match(linkRegex);
    if (links && links.length > 0) {
        userLinkCount.set(userId, (userLinkCount.get(userId) || 0) + links.length);
        if (userLinkCount.get(userId) > SPAM_LINK_THRESHOLD) {
            await handleSpam(ctx, 'link_spam');
            userLinkCount.set(userId, 0); // Reset after action
            return true;
        }
    } else {
        userLinkCount.set(userId, 0);
    }

    // 3. בדיקת ספאם קללות (דורש רשימת קללות)
    const cursesList = typeof curses !== 'undefined' ? curses : defaultCurses; // ✅ שימוש ברשימה המיובאת או בדיפולט

    const lowerCaseText = messageText.toLowerCase();
    const curseMatches = cursesList.filter(curse => lowerCaseText.includes(curse));
    if (curseMatches.length > 0) {
        userCurseCount.set(userId, (userCurseCount.get(userId) || 0) + curseMatches.length);
        if (userCurseCount.get(userId) > SPAM_CURSE_THRESHOLD) {
            await handleSpam(ctx, 'curse_spam');
            userCurseCount.set(userId, 0); // Reset after action
            return true;
        }
    } else {
        userCurseCount.set(userId, 0);
    }

    // 4. בדיקת הודעות זהות חוזרות
    const sameMessages = history.filter(msg => msg.text === messageText);
    if (sameMessages.length > SPAM_SAME_MESSAGE_THRESHOLD) {
        await handleSpam(ctx, 'same_message_spam');
        return true;
    }

    return false;
}

/**
 * מטפל בהודעת ספאם - מוחק אותה ושולח תגובה.
 * @param {import('grammy').Context} ctx - אובייקט הקונטקסט של grammy.
 * @param {string} spamType - סוג הספאם שזוהה.
 */
async function handleSpam(ctx, spamType) {
    try {
        // מחק את הודעת הספאם
        await ctx.deleteMessage().catch(e => console.error('Failed to delete spam message:', e));

        // שלח תגובה חכמה באמצעות GPT
        const spamResponse = await getAntiSpamResponse(spamType);
        // ✅ תיקון: הסרת reply_to_message_id מכיוון שההודעה נמחקת
        await ctx.reply(spamResponse, { parse_mode: 'HTML' }).catch(e => console.error('Failed to reply to spam:', e)); 

        const user = ctx.from;
        const chat = ctx.chat; // ✅ המשתנה הזה קיים בשימוש, כפי שדנו קודם.
        const logMessage = `🚨 **ספאם זוהה ומטופל!**\n` +
                           `**משתמש:** ${user.first_name} (@${user.username || user.id})\n` +
                           `**צ'אט:** ${chat.title || chat.type} (ID: ${chat.id})\n` +
                           `**סוג ספאם:** ${spamType.replace('_', ' ')}\n` +
                           `**הודעה מקורית:** \`${ctx.message.text ? ctx.message.text.substring(0, 100) : '[אין טקסט]'}\``;
        
        // ✅ שימוש ב-discordSendStaffLog רק אם קיים גשר לדיסקורד
        if (typeof global.client !== 'undefined' && global.client.channels) { // בדיקה בטוחה
            await discordSendStaffLog(global.client, '🚨 ספאם טלגרם זוהה', logMessage, 0xFF0000);
        } else {
            // אם אין גשר לדיסקורד, נדפיס לקונסול בלבד עבור לוגים של טלגרם
            console.log(`[STAFF_LOG_TELEGRAM] ${logMessage}`);
        }
        
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
    let prompt = '';
    switch (spamType) {
        case 'fast_spam':
            prompt = `משתמש שולח הודעות מהר מדי. הגב בטון עוקצני אך מתוחכם, כאילו אתה מתלונן על הרעש. אל תהיה בוטה.
            דוגמאות: "אפשר להוריד את הווליום, אנחנו עדיין פה.", "הקצב שלך שלך מהיר יותר מהמוח שלי. תאט קצת.", "נראה לי שהמקלדת שלך נתקעה על הילוך חמישי."
            תגובה:`;
            break;
        case 'link_spam':
            prompt = `משתמש שולח הרבה קישורים. הגב בסרקסטיות, כאילו אתה מזהיר אותו מההשלכות או מתלונן על הפרסומות.
            דוגמאות: "תודה על הקישור, אבל אני לא מחפש הלוואה מהירה כרגע.", "האם אתה מנסה למכור לי משהו? כי אני לא קונה.", "אני מניח שאתה מקבל עמלה על כל קישור שאתה שולח."
            תגובה:`;
            break;
        case 'curse_spam':
            prompt = `משתמש מקלל. הגב בטון מתנשא וציני, כאילו אתה מעל השפה הזו. אל תחזיר קללות.
            דוגמאות: "הלקסיקון שלך מרשים... בערך.", "נראה שמישהו שכח את המילים היפות בבית.", "האם זה ניסיון להרשים? כי זה לא עובד."
            תגובה:`;
            break;
        case 'same_message_spam':
            prompt = `משתמש שולח הודעות זהות שוב ושוב. הגב בסרקסטיות על חוסר היצירתיות או על חוסר הטעם.
            דוגמאות: "כבר הבנו, יש לך רק מילה אחת בלקסיקון?", "האם אתה תקוע בלופ? כי אני לא.", "העתק-הדבק זה כל כך 2000 ואחת."
            תגובה:`;
            break;
        default:
            prompt = `זוהה ספאם. הגב בטון סרקסטי ועוקצני.
            תגובה:`;
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // או 'gpt-3.5-turbo' לחיסכון
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