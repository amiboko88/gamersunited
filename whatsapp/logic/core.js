// 📁 whatsapp/logic/core.js
// 🧱 Orchestrator Module (Refactored)
const { log } = require('../../utils/logger');
const bufferSystem = require('./buffer');
const { whatsapp } = require('../../config/settings');
const shimonBrain = require('../../handlers/ai/brain');

// Modules
const router = require('./router');
const processor = require('./processor');
const mediaHandler = require('./media_handler');

// State
const processingGroups = new Set();

async function handleMessageLogic(sock, msg, text, resolvedPhone) {
    // 1. Route & Analyze
    const route = await router.analyzeRequest(sock, msg, text, resolvedPhone);
    const { chatJid, senderPhone, isAdmin, isPrivate, refusalReason, lidDebug, linkedDbId } = route;

    // 2. Debug Reporting (LID)
    if (lidDebug) {
        await sock.sendMessage(lidDebug.target, {
            text: `📊 *LID Debug Report*\n🆔 **מקור:** \`${lidDebug.lid}\` (LID)\n👤 **זוהה כ:** \`${lidDebug.realId}\`\n✅ **סטטוס:** סנכרון תקין.`
        });
    }

    // 3. System Status Refusal (AI Powered)
    if (refusalReason) {
        // Quick Trigger Check for Refusal
        const isTriggered = text.includes('@') || whatsapp.wakeWords.some(w => text.toLowerCase().includes(w));

        if (isPrivate || isTriggered) {
            log(`🛑 [Core] System Inactive (${refusalReason}). AI Refusing ${senderPhone}.`);
            const refusalContext = `
            [SYSTEM OVERRIDE: INACTIVE MODE]
            Current Status: ${refusalReason}.
            The user tried to contact you, but the station is CLOSED.
            MISSION: Refuse to help. Tell them to come back later.
            STYLE: If Night -> "Go to sleep". If Shabbat -> "Shabbat Shalom / I'm resting".
            Maintain Shimon persona.
            `;
            const aiResponse = await shimonBrain.ask(linkedDbId || senderPhone, 'whatsapp', `${refusalContext}\n\nUser Says: "${text}"`, isAdmin, null, chatJid);
            await sock.sendMessage(chatJid, { text: aiResponse }, { quoted: msg });
        }
        return; // Stop
    }

    // 4. Buffer & Process
    bufferSystem.addToBuffer(senderPhone, msg, text, async (finalMsg, combinedText, mediaArray) => {
        // 🔒 Locking
        if (processingGroups.has(chatJid)) {
            log(`🔒 [Core] Group Lock Active: ${chatJid}`);
            return;
        }
        processingGroups.add(chatJid);
        const lockTimeout = setTimeout(() => processingGroups.delete(chatJid), 10000);

        try {
            // 🛡️ IGNORE EMPTY MESSAGES (Audio, Stickers without caption) to prevent Hallucinations ("Silence silence")
            if ((!combinedText || combinedText.trim().length === 0) && mediaArray.length === 0) {
                log(`🔇 [Core] Ignoring empty/audio message from ${senderPhone}`);
                return;
            }

            // A. Admin Commands
            const cleanText = combinedText.replace(/@\d+/g, '').trim().toLowerCase();
            const scanKeywords = ['סרוק', 'תתעד', 'תעד', 'צלם', 'scan', 'document'];
            const isScanRequest = scanKeywords.some(k => cleanText.startsWith(k) || cleanText === k);

            if (isScanRequest && isAdmin) {
                // If the command came WITH active images (e.g. caption on image), use them.
                const directScanBuffers = await mediaHandler.downloadImages(mediaArray, sock);
                await mediaHandler.handleScanCommand(sock, finalMsg, chatJid, linkedDbId, isAdmin, directScanBuffers);
                return;
            }
            if (combinedText === 'נקה' && isAdmin) {
                await mediaHandler.handleClearCache(sock, chatJid, finalMsg);
                return;
            }

            // 👑 Admin Manual MVP Trigger
            if (['שלח mvp', 'שלח MVP', 'הכרז mvp'].includes(combinedText) && isAdmin) {
                await sock.sendMessage(chatJid, { text: '⏳ מפעיל הכרזת MVP ידנית (Manual Trigger)...' }, { quoted: finalMsg });
                const rankingManager = require('../../handlers/ranking/manager');
                rankingManager.announceMVP().catch(e => log(`❌ Manual MVP Error: ${e.message}`));
                return;
            }

            // 🚀 Admin User Campaign Trigger (The Deserters)
            if (['תפעיל קמפיין נוטשים', 'תפעיל פרוטוקול נוטשים'].some(phrase => combinedText.includes(phrase)) && isAdmin) {
                const campaign = require('../../handlers/campaigns/deserters');
                // Run in background so we don't block the loop, but initial message is sent inside
                campaign.runFullCampaign(sock, chatJid).catch(e => log(`❌ Campaign Error: ${e.message}`));
                return;
            }

            // B. Media Download
            const imageBuffers = await mediaHandler.downloadImages(mediaArray, sock);
            if (imageBuffers.length > 0) {
                // Save to Short-Term Memory for !scan command
                mediaHandler.cacheRecentImages(chatJid, imageBuffers);
            }

            // C. Auto-Scan (Universal - Private & Group) 🌍
            if (imageBuffers.length > 0) {
                // If it's a manual command, we already handled it above.
                // If we are here, it's just an image message.

                // Determine Identity properly
                const scanIdentity = linkedDbId || senderPhone;

                // Trigger Scan in "Auto Mode" (Silent errors)
                // Pass 'true' as the last arg for isAutoMode
                await mediaHandler.handleScanCommand(sock, finalMsg, chatJid, scanIdentity, isAdmin, imageBuffers, true);

                // If Private, clear buffer immediately. If Group, maybe keep for context?
                // Clearing is safer to avoid double processing if they type text later.
                bufferSystem.clearBuffer(senderPhone);

                // Even if we scanned, we might want to continue to Processor if there was text?
                // Usually Scoreboards don't need AI chat response unless asked.
                // Let's return to prevent Shimon from hallucinating on the image if he already extracted stats.
                return;
            }

            // D. Process Request (Brain/Intel/XP)
            const result = await processor.processRequest(sock, finalMsg, combinedText, route, imageBuffers);

            if (!result) return; // Silent ignore

            // E. Handle Response
            if (result.type === 'intel') {
                const data = result.data;
                if (typeof data === 'object' && data.image) {
                    await sock.sendMessage(chatJid, { image: { url: data.image }, caption: data.text }, { quoted: finalMsg });
                    if (data.code) setTimeout(() => sock.sendMessage(chatJid, { text: data.code }), 500);
                } else {
                    const txt = typeof data === 'string' ? data : (data.aiSummary || data.text);
                    if (txt) await sock.sendMessage(chatJid, { text: txt }, { quoted: finalMsg });
                }
            }
            else if (result.type === 'brain') {
                const aiText = result.data;
                // Feedback for Image processing
                if (imageBuffers.length > 0 && !aiText.includes('Error')) {
                    setTimeout(() => sock.sendMessage(chatJid, { react: { text: "👍", key: finalMsg.key } }).catch(() => { }), 1000);
                }

                // Voice & Send
                const playedVoice = await mediaHandler.handleVoice(aiText, sock, chatJid, finalMsg);
                if (playedVoice !== true) { // If not true (sent audio), it returns stripped text or null
                    const textToSend = playedVoice || aiText;
                    if (textToSend) {
                        await sock.sendMessage(chatJid, { text: textToSend }, { quoted: finalMsg });
                        processor.touchBotActivity(); // 🔓 Extend attention
                    }
                }
            }

        } catch (e) {
            log(`❌ [Core] Error: ${e.message}`);
        } finally {
            clearTimeout(lockTimeout);
            setTimeout(() => processingGroups.delete(chatJid), 2000);
        }
    });
}

module.exports = { handleMessageLogic };