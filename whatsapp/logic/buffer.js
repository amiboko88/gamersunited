// 📁 whatsapp/logic/buffer.js
const { log } = require('../../utils/logger');
const { buffer } = require('../../config/settings');

const messageBuffer = new Map();
const spamMap = new Map();

function isSpammer(senderId) {
    const now = Date.now();
    let userData = spamMap.get(senderId);

    if (!userData) {
        userData = { count: 0, firstMsgTime: now, blockedUntil: 0 };
        spamMap.set(senderId, userData);
    }

    if (now < userData.blockedUntil) return { blocked: true, silent: true };

    if (now - userData.firstMsgTime > buffer.spamWindowMs) {
        userData.count = 0;
        userData.firstMsgTime = now;
    }

    userData.count++;

    if (userData.count > buffer.spamLimit) {
        userData.blockedUntil = now + buffer.cooldownMs;
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
        session = { textParts: [], mediaArray: [], lastMsg: msg };
    }

    if (text) session.textParts.push(text);
    if (msg.message.imageMessage) session.mediaArray.push(msg);
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
    }, buffer.windowMs);

    messageBuffer.set(senderId, session);
}

function executeSession(senderId, session, processCallback) {
    messageBuffer.delete(senderId);
    const fullText = session.textParts.join(" ");
    // Use the first media message as "primary" for quoting, or the last text message
    const primaryMsg = session.mediaArray.length > 0 ? session.mediaArray[session.mediaArray.length - 1] : session.lastMsg;

    // ✅ לוג משוחזר: מראה שהבאפר סיים ומשחרר ל-Core
    log(`[Buffer] ⏩ Processed batch for ${senderId}: "${fullText}" (Images: ${session.mediaArray.length})`);

    processCallback(primaryMsg, fullText, session.mediaArray);
    processCallback(primaryMsg, fullText, session.mediaArray);
}

// ✅ External Access Methods (for Core Logic)
function hasMedia(senderId) {
    const session = messageBuffer.get(senderId);
    return session && session.mediaArray && session.mediaArray.length > 0;
}

function getBuffer(senderId) {
    const session = messageBuffer.get(senderId);
    // Return the media array or empty array if none
    return session ? session.mediaArray : [];
}

function clearBuffer(senderId) {
    messageBuffer.delete(senderId);
}

module.exports = { addToBuffer, hasMedia, getBuffer, clearBuffer };