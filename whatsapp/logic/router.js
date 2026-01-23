// 📁 whatsapp/logic/router.js
const { isSystemActive } = require('../utils/timeHandler');
const { getUserRef } = require('../../utils/userUtils');
const config = require('../../handlers/ai/config');

async function routeMessage(msg, text) {
    const isPrivate = !msg.key.remoteJid.endsWith('@g.us');
    let senderFullJid = msg.key.participant || msg.participant || msg.key.remoteJid;

    // Normalization logic will be handled here or passed in?
    // In original core.js, resolvedPhone was passed in index.js.
    // We should assume index.js still does the heavy lifting of `realSenderPhone`.
    // But router needs to finalize `chatJid`.

    return { isPrivate };
}

// Rewriting for deeper logic extraction
async function analyzeRequest(sock, msg, text, resolvedPhone) {
    const isPrivate = !msg.key.remoteJid.endsWith('@g.us');

    // 1. JID Normalization (Privacy & Admin Fix)
    const chatJid = (isPrivate && resolvedPhone) ? `${resolvedPhone}@s.whatsapp.net` : msg.key.remoteJid;
    const senderFullJid = msg.key.participant || msg.participant || chatJid;
    const senderPhone = resolvedPhone || senderFullJid.split('@')[0];

    // 2. Admin Check
    let isAdmin = config.ADMIN_PHONES.includes(senderPhone);
    if (!isAdmin && senderPhone.length > 15) {
        if (senderPhone === '100772834480319') isAdmin = true;
    }

    // 3. System Status
    const systemStatus = isSystemActive();

    // 4. LID Debug Logic
    let lidDebug = null;
    let linkedDbId = null;
    try {
        const userRef = await getUserRef(senderFullJid, 'whatsapp');
        if (userRef.id.length > 15) linkedDbId = userRef.id;

        const realUserId = userRef.id;
        if (senderPhone.length > 14) {
            const status = (realUserId.length <= 14) ? "✅ VERIFIED" : "⚠️ UNKNOWN";
            if (status.includes("VERIFIED")) {
                lidDebug = {
                    lid: senderPhone,
                    realId: realUserId,
                    target: '972526800647@s.whatsapp.net'
                };
            }
        }
    } catch (e) { }

    // 5. Refusal Logic
    let refusalReason = null;
    if (!systemStatus.active && !isAdmin) {
        // If not Admin, we normally refuse.
        // But we need to check if triggered explicitly to generate the AI Refusal
        // OR if private (where we always refuse nicely).
        // Trigger logic needs to be passed or checked here.
        // We'll return "refusalReason" and let Core decide if to act on it (based on trigger).
        refusalReason = systemStatus.reason || "System Offline";
    }

    return {
        chatJid,
        senderPhone,
        senderFullJid,
        isAdmin,
        isPrivate,
        linkedDbId,
        refusalReason,
        lidDebug
    };
}

module.exports = { analyzeRequest };
