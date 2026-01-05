// 📁 whatsapp/logic/buffer.js
const { log } = require('../../utils/logger');

const messageBuffer = new Map();
const spamMap = new Map(); 

const SPAM_LIMIT = 7; 
const SPAM_WINDOW_MS = 10000; 
const COOLDOWN_MS = 60000; 
const BUFFER_DELAY_MS = 1500; 

function isSpammer(senderId) {
    const now = Date.now();
    let userData = spamMap.get(senderId);

    if (!userData) {
        userData = { count: 0, firstMsgTime: now, blockedUntil: 0 };
        spamMap.set(senderId, userData);
    }

    if (now < userData.blockedUntil) return { blocked: true, silent: true };

    if (now - userData.firstMsgTime > SPAM_WINDOW_MS) {
        userData.count = 0;
        userData.firstMsgTime = now;
    }

    userData.count++;

    if (userData.count > SPAM_LIMIT) {
        userData.blockedUntil = now + COOLDOWN_MS;
        log(`[Buffer] 🚫 User ${senderId} blocked for spamming.`);
        return { blocked: true, silent: false };
    }

    return { blocked: false };
}

function addToBuffer(senderId, msg, text, processCallback) {
    const spamCheck = isSpammer(senderId);
    if (spamCheck.blocked) {
        if (!spamCheck.silent) {
            processCallback(msg, "BLOCKED_SPAM", null);
        }
        return; 
    }

    let session = messageBuffer.get(senderId);
    if (session) {
        clearTimeout(session.timer);
    } else {
        session = { textParts: [], mediaMsg: null, lastMsg: msg };
    }

    if (text) session.textParts.push(text);
    if (msg.message.imageMessage) session.mediaMsg = msg;
    session.lastMsg = msg;

    // לוג קבלת הודעה (פנימי)
    // log(`[Buffer] 📥 Received chunk from ${senderId}: "${text}"`);

    const isUrgent = text.includes('@') || text.includes('שמעון') || text.includes('רולטה');
    if (isUrgent) {
        log(`[Buffer] 🚀 Urgent trigger for ${senderId}`);
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
    
    // ✅ לוג משוחזר: מראה שהבאפר סיים ומשחרר ל-Core
    log(`[Buffer] ⏩ Processed batch for ${senderId}: "${fullText}" (Images: ${session.mediaMsg ? 'Yes' : 'No'})`);
    
    processCallback(primaryMsg, fullText, session.mediaMsg);
}

module.exports = { addToBuffer };