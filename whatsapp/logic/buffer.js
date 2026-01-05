// 📁 whatsapp/logic/buffer.js
const { log } = require('../../utils/logger');

const messageBuffer = new Map();
const spamMap = new Map(); // מעקב אחרי ספאמרים

// הגדרות הגנה
const SPAM_LIMIT = 6; // טיפה יותר סלחן
const SPAM_WINDOW_MS = 10000; // ב-10 שניות
const COOLDOWN_MS = 60000; // דקה עונש

// ✅ שינוי קריטי: הורדנו מ-2000 ל-1500 (שניה וחצי) לשיפור תגובתיות
const BUFFER_DELAY_MS = 1500; 

function isSpammer(senderId) {
    const now = Date.now();
    let userData = spamMap.get(senderId);

    if (!userData) {
        userData = { count: 0, firstMsgTime: now, blockedUntil: 0 };
        spamMap.set(senderId, userData);
    }

    // אם המשתמש חסום
    if (now < userData.blockedUntil) return { blocked: true, silent: true };

    // איפוס חלון זמן
    if (now - userData.firstMsgTime > SPAM_WINDOW_MS) {
        userData.count = 0;
        userData.firstMsgTime = now;
    }

    userData.count++;

    // בדיקת חריגה
    if (userData.count > SPAM_LIMIT) {
        userData.blockedUntil = now + COOLDOWN_MS;
        log(`[Buffer] 🚫 User ${senderId} blocked for spamming.`);
        return { blocked: true, silent: false }; // Silent=false אומר שצריך להזהיר אותו פעם אחת
    }

    return { blocked: false };
}

function addToBuffer(senderId, msg, text, processCallback) {
    // 1. בדיקת ספאם
    const spamCheck = isSpammer(senderId);
    if (spamCheck.blocked) {
        if (!spamCheck.silent) {
            processCallback(msg, "BLOCKED_SPAM", null);
        }
        return; 
    }

    // 2. ניהול הבאפר
    let session = messageBuffer.get(senderId);
    if (session) {
        clearTimeout(session.timer); // איפוס טיימר אם ממשיך להקליד
    } else {
        session = { textParts: [], mediaMsg: null, lastMsg: msg };
    }

    if (text) session.textParts.push(text);
    if (msg.message.imageMessage) session.mediaMsg = msg;
    session.lastMsg = msg;

    // שבירת טיימר למקרים דחופים
    const isUrgent = text.includes('@') || text.includes('שמעון') || text.includes('רולטה');
    if (isUrgent) {
        executeSession(senderId, session, processCallback);
        return;
    }

    session.timer = setTimeout(() => {
        executeSession(senderId, session, processCallback);
    }, BUFFER_DELAY_MS);

    messageBuffer.set(senderId, session);
}

function executeSession(senderId, session, processCallback) {
    messageBuffer.delete(senderId);
    const fullText = session.textParts.join(" ");
    const primaryMsg = session.mediaMsg || session.lastMsg;
    processCallback(primaryMsg, fullText, session.mediaMsg);
}

module.exports = { addToBuffer };