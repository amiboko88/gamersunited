// 📁 whatsapp/logic/media_handler.js
const { log } = require('../../utils/logger');
const visionSystem = require('../../handlers/media/vision');
const voiceEngine = require('../../handlers/media/voice'); // Using the aligned voice engine
const { generateContent } = require('../../handlers/ai/gemini');
const codStats = require('../../handlers/ai/tools/cod_stats');
const db = require('../../utils/firebase');

async function downloadImages(mediaArray, sock) {
    let buffers = [];
    if (mediaArray && mediaArray.length > 0) {
        log(`📥 [Media] Downloading ${mediaArray.length} images...`);
        for (const mediaMsg of mediaArray) {
            try {
                const buf = await visionSystem.downloadWhatsAppImage(mediaMsg, sock);
                if (buf) buffers.push(buf);
            } catch (err) { log(`❌ Error downloading image: ${err.message}`); }
        }
    }
    return buffers;
}

async function handleVoice(aiResponse, sock, chatJid, msg) {
    if (aiResponse && aiResponse.includes('[VOICE]')) {
        const responseText = aiResponse.replace('[VOICE]', '').trim();
        try {
            const audioBuffer = await voiceEngine.textToSpeech(responseText);
            if (audioBuffer) {
                await sock.sendMessage(chatJid, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: msg });
                return true; // Sent Audio
            }
        } catch (e) {
            log(`❌ [Voice] Generation failed: ${e.message}`);
        }
        return responseText; // Return text as fallback
    }
    return null; // Not voice
}

async function handleScanCommand(sock, msg, chatJid, dbUserId, isAdmin) {
    const store = require('../store');
    const messages = store.getMessages(chatJid);
    log(`🕵️ [Scan] Checking ${messages.length} messages in memory...`);

    let foundImages = messages.filter(m => m.message?.imageMessage);

    if (foundImages.length === 0) {
        await sock.sendMessage(chatJid, { text: '🕵️ Scan Complete: No recent images found.' }, { quoted: msg });
        return;
    }

    await sock.sendMessage(chatJid, { text: `🕵️ Found ${foundImages.length} images. Processing...` }, { quoted: msg });

    const buffers = await downloadImages(foundImages, sock);

    try {
        const parts = [{ text: "Extract Warzone Scoreboard data from these images. Return JSON list: [{username, kills, damage, placement, mode}]. If not a scoreboard, return empty list." }];
        buffers.forEach(b => parts.push({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } }));

        const result = await generateContent(parts, "gemini-2.0-flash");
        const jsonMatch = result.match(/\[.*\]/s);

        if (!jsonMatch) {
            await sock.sendMessage(chatJid, { text: '❌ Analysis failed: No JSON found.' });
            return;
        }

        const matches = JSON.parse(jsonMatch[0]);
        const report = await codStats.execute({ matches }, dbUserId || 'ScanAdmin', chatJid, buffers);
        await sock.sendMessage(chatJid, { text: `📊 **Scan Report:**\n${report}` });

    } catch (e) {
        await sock.sendMessage(chatJid, { text: `❌ Scan Error: ${e.message}` });
    }
}

async function handleClearCache(sock, chatJid, msg) {
    const snap = await db.collection('processed_images').orderBy('timestamp', 'desc').limit(20).get();
    if (snap.empty) {
        await sock.sendMessage(chatJid, { text: '🧹 Cache is already clean.' }, { quoted: msg });
    } else {
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        await sock.sendMessage(chatJid, { text: `🧹 **Cache Cleared!**\nDeleted ${snap.size} recent hashes.` }, { quoted: msg });
    }
}

module.exports = { downloadImages, handleVoice, handleScanCommand, handleClearCache };
