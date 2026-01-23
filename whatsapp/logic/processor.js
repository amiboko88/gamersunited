// 📁 whatsapp/logic/processor.js
const { log } = require('../../utils/logger');
const shimonBrain = require('../../handlers/ai/brain');
const learningEngine = require('../../handlers/ai/learning');
const userManager = require('../../handlers/users/manager');
const xpManager = require('../../handlers/economy/xpManager');
const intelManager = require('../../handlers/intel/manager');
const { whatsapp } = require('../../config/settings');

const activeConversations = new Map();

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
    // Core already decided to RUN (or not) based on locks.
    // Now we decide if AI *wants* to run (Smart Brain).

    // Check if explicitly called (Trigger handled in core/buffer logic passing here).
    // Wait, Core usually checks `isTriggered`.
    // Let's assume Core passes a flag `isExplicitCall`.
    // But `isExplicitCall` logic depends on text.
    // We should re-evaluate trigger here OR accept it as arg.
    // Let's calculate it here for safety or import utils.

    // Actually, Core calls Buffer. Buffer calls back with `combinedText`.
    // We need to re-check trigger on `combinedText`.

    // Let's assume Core handles the "Trigger Detection" before calling Processor?
    // No, Buffer callback is the execution point.
    // I'll calculate `isExplicitCall` inside `processRequest` using a Helper or Regex.
    // I'll duplicate `isTriggered` logic here or move `isTriggered` to Router/Utils.

    // Let's imply `routerData.isExplicitCall` was passed?
    // The text changes (Buffer combines it).
    // So we must check trigger on FINAL text.

    const botId = sock.user?.id?.split(':')[0];
    const isExplicitCall = (
        text.includes(`@${botId}`) ||
        whatsapp.wakeWords.some(w => text.toLowerCase().includes(w)) ||
        (isPrivate && isAdmin) // Admin Override
    );

    const lastInteraction = activeConversations.get(senderPhone);
    const isInConversation = lastInteraction && (Date.now() - lastInteraction < whatsapp.conversationTimeout);

    // 🛑 Anti-Spam (Group Only)
    if (!isExplicitCall) {
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
        if (!hasMedia && text.length > 10) {
            const brainIdentity = dbUserId || senderPhone;
            shouldRun = await shimonBrain.shouldReply(brainIdentity, text);
            if (shouldRun) log(`💡 [Smart AI] Intervening on: "${text}"`);
        }
    }

    if (!shouldRun) {
        if (dbUserId) await learningEngine.learnFromContext(dbUserId, "Gamer", 'whatsapp', text);
        return null; // Silent ignore
    }

    // Update State
    activeConversations.set(senderPhone, Date.now());
    if (!isExplicitCall) activeConversations.set(chatJid + '_last_auto_reply', Date.now());

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

module.exports = { processRequest };
