// 📁 whatsapp/logic/processor.js
const { log } = require('../../utils/logger');
const shimonBrain = require('../../handlers/ai/brain');
const learningEngine = require('../../handlers/ai/learning');
const userManager = require('../../handlers/users/manager');
const xpManager = require('../../handlers/economy/xpManager');
const intelManager = require('../../handlers/intel/manager');
const { whatsapp } = require('../../config/settings');

const activeConversations = new Map();
let lastGlobalBotActivity = 0;

function touchBotActivity() {
    lastGlobalBotActivity = Date.now();
}

async function processRequest(sock, msg, text, routerData, imageBuffers) {
    const { chatJid, senderPhone, dbUserId, isAdmin, isPrivate } = routerData;

    // 1. XP Management (Guest or User)
    if (dbUserId) {
        try {
            await userManager.updateLastActive(dbUserId);
            xpManager.handleXP(dbUserId, 'whatsapp', text, { sock, chatId: chatJid }, async (res) => {
                if (typeof res === 'string') await sock.sendMessage(chatJid, { text: res }, { quoted: msg });
            });
        } catch (e) { }
    }

    // 2. Conversation State & Filtering
    const botId = sock.user?.id?.split(':')[0];
    const isExplicitCall = (
        text.includes(`@${botId}`) ||
        whatsapp.wakeWords.some(w => text.toLowerCase().includes(w)) ||
        (isPrivate && isAdmin) // Admin Override
    );

    const lastInteraction = activeConversations.get(senderPhone);
    const isInConversation = lastInteraction && (Date.now() - lastInteraction < whatsapp.conversationTimeout);

    // 🧠 GLOBAL ATTENTION WINDOW (The "Yogi Fix")
    // If bot spoke in last 2 minutes, check EVERYTHING (unless it's a mention of someone else).
    const isGlobalAttention = (Date.now() - lastGlobalBotActivity < 120000);

    // 🛑 Anti-Spam (Group Only)
    if (!isExplicitCall && !isGlobalAttention) {
        const groupCooldown = activeConversations.get(chatJid + '_last_auto_reply');
        if (groupCooldown && Date.now() - groupCooldown < 20000) return null;
    }

    // ✅ Smart Brain Decision
    let shouldRun = isExplicitCall || isInConversation;
    if (!shouldRun) {
        // Mentions check
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;

        if (mentionedJids.length > 0) return null; // Mentioned someone else
        if (quotedParticipant && !quotedParticipant.includes(botId)) return null; // Quoted someone else

        const hasMedia = imageBuffers && imageBuffers.length > 0;

        // If Global Attention is ON, we relax the text length check
        const contextCheckParams = isGlobalAttention ? { active: true } : null;

        if (!hasMedia && (text.length > 10 || isGlobalAttention)) {
            const brainIdentity = dbUserId || senderPhone;
            shouldRun = await shimonBrain.shouldReply(brainIdentity, text, contextCheckParams);
            if (shouldRun) log(`💡 [Smart AI] Intervening on: "${text}" (Attention: ${isGlobalAttention})`);
        }
    }

    if (!shouldRun) {
        if (dbUserId) await learningEngine.learnFromContext(dbUserId, "Gamer", 'whatsapp', text);
        return null; // Silent ignore
    }

    // Update State
    activeConversations.set(senderPhone, Date.now());
    if (!isExplicitCall) activeConversations.set(chatJid + '_last_auto_reply', Date.now());
    touchBotActivity(); // Update our own activity tracking

    await sock.sendPresenceUpdate('composing', chatJid);

    // 🕵️ INTEL INTERCEPT
    try {
        const intelResponse = await intelManager.handleNaturalQuery(text);
        if (intelResponse) {
            log(`🕵️ [Intel] Intercept: ${text}`);
            return { type: 'intel', data: intelResponse };
        }
    } catch (e) { }

    // 🧠 ASK BRAIN
    const aiResponse = await shimonBrain.ask(
        dbUserId || senderPhone,
        'whatsapp',
        text,
        isAdmin,
        imageBuffers,
        chatJid
    );

    return { type: 'brain', data: aiResponse };
}

module.exports = { processRequest, touchBotActivity };
