const { log } = require('../../utils/logger');

// מפה שמחזיקה את המשתמשים שמקלידים כרגע
// Key: senderId, Value: { timer, textParts: [], media: null, lastMsg: obj }
const messageBuffer = new Map();

// זמן המתנה (בשניות) לפני ששמעון עונה
const BUFFER_DELAY_MS = 3500; // 3.5 שניות - מספיק זמן לכתוב עוד הודעה

/**
 * מוסיף הודעה לתור של המשתמש.
 * @param {string} senderId - המזהה של השולח
 * @param {object} msg - אובייקט ההודעה המקורי (של וואטסאפ)
 * @param {string} text - הטקסט של ההודעה הנוכחית
 * @param {function} processCallback - הפונקציה שתופעל כשהטיימר יסתיים (הלוגיקה של שמעון)
 */
function addToBuffer(senderId, msg, text, processCallback) {
    // 1. האם יש כבר סשן פתוח למשתמש הזה?
    let session = messageBuffer.get(senderId);

    if (session) {
        // יש סשן קיים - מאפסים את הטיימר (Debounce)
        clearTimeout(session.timer);
    } else {
        // סשן חדש
        session = { 
            textParts: [], 
            mediaMsg: null, 
            lastMsg: msg // שומרים את ההודעה האחרונה כדי לצטט אותה בסוף
        };
    }

    // 2. איסוף המידע
    if (text) {
        session.textParts.push(text);
    }

    // אם יש תמונה בהודעה הנוכחית, נשמור אותה
    // (זה פותר את הבעיה ששולחים תמונה ואח"כ טקסט)
    if (msg.message.imageMessage) {
        session.mediaMsg = msg;
    }
    
    // עדכון ההודעה האחרונה (לצורך ציטוט)
    session.lastMsg = msg;

    // 3. מקרים מיוחדים לשבירת הטיימר (Immediate Trigger)
    // אם המשתמש תייג את שמעון או כתב מילה דחופה - לא מחכים!
    const isUrgent = text.includes('@') || text.includes('שמעון');

    if (isUrgent) {
        log(`[Buffer] 🚀 Urgent trigger for ${senderId}`);
        executeSession(senderId, session, processCallback);
        return;
    }

    // 4. הפעלת הטיימר
    session.timer = setTimeout(() => {
        executeSession(senderId, session, processCallback);
    }, BUFFER_DELAY_MS);

    // שמירה בזיכרון
    messageBuffer.set(senderId, session);
}

/**
 * פונקציית עזר פנימית לביצוע הלוגיקה וניקוי הזיכרון
 */
function executeSession(senderId, session, processCallback) {
    // מחיקה מהזיכרון (כדי שלא יופעל שוב)
    messageBuffer.delete(senderId);
    
    // איחוד כל הטקסטים למשפט אחד שלם
    const fullText = session.textParts.join(" "); // "למה" + "אתה" + "לא עונה" -> "למה אתה לא עונה"
    
    // קביעת ההודעה הראשית לטיפול (אם הייתה תמונה, היא הקובעת)
    const primaryMsg = session.mediaMsg || session.lastMsg;

    log(`[Buffer] 📦 Processed batch for ${senderId}: "${fullText}" (Images: ${session.mediaMsg ? 'Yes' : 'No'})`);

    // שליחה למוח של שמעון
    processCallback(primaryMsg, fullText, session.mediaMsg);
}

module.exports = { addToBuffer };