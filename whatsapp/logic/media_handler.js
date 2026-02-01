// 📁 whatsapp/logic/media_handler.js
const { log } = require('../../utils/logger');
const visionSystem = require('../../handlers/media/vision');
const voiceEngine = require('../../handlers/media/voice'); // Using the aligned voice engine
const { generateContent } = require('../../handlers/ai/gemini');
const codStats = require('../../handlers/ai/tools/cod_stats');
const db = require('../../utils/firebase');
const shimonBrain = require('../../handlers/ai/brain');
const processor = require('./processor'); // 🔌 Link to attention system

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

async function handleScanCommand(sock, msg, chatJid, dbUserId, isAdmin, directBuffers = [], isAutoMode = false) {
    let buffers = [];

    // 1. Direct Buffers (Caption on Image) OR Auto-Scan
    if (directBuffers && directBuffers.length > 0) {
        log(`🕵️ [Scan] Processing ${directBuffers.length} images (Auto: ${isAutoMode}).`);
        buffers = directBuffers;
    }
    // 2. Cache Fallback (User sent Image then "!scan")
    else if (lastImageCache.has(chatJid)) {
        const cached = lastImageCache.get(chatJid);
        if (Date.now() - cached.time < 120000) { // 2 min validity
            log(`🕵️ [Scan] Found ${cached.buffers.length} images in recent cache.`);
            buffers = cached.buffers;
            lastImageCache.delete(chatJid); // Consume cache
        }
    }

    // 3. Store Fallback (Legacy/Laggy)
    if (buffers.length === 0) {
        if (isAutoMode) return; // Silent exit if auto and no images (shouldn't happen given logic)

        const store = require('../store');
        const messages = store.getMessages(chatJid);
        log(`🕵️ [Scan] Manual Scan: Checking ${messages.length} messages in memory...`);

        let foundImages = messages.filter(m => m.message?.imageMessage);

        if (foundImages.length === 0) {
            await sock.sendMessage(chatJid, { text: '🕵️ Scan Complete: No recent images found.' }, { quoted: msg });
            return;
        }

        await sock.sendMessage(chatJid, { text: `🕵️ Found ${foundImages.length} images. Processing...` }, { quoted: msg });
        buffers = await downloadImages(foundImages, sock);
    }

    // --- Batch Processing (Resilience) 🛡️ ---
    const CHUNK_SIZE = 5;
    let allMatches = [];
    let errors = [];

    for (let i = 0; i < buffers.length; i += CHUNK_SIZE) {
        const chunk = buffers.slice(i, i + CHUNK_SIZE);
        const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(buffers.length / CHUNK_SIZE);

        // Notify only if Manual or Bulk
        if (!isAutoMode && totalChunks > 1) {
            await sock.sendMessage(chatJid, { text: `⏳ Processing batch ${chunkIndex}/${totalChunks}...` });
        }

        try {
            const parts = [{ text: "Extract Gaming Scoreboard data from these images. Detect the game: 'Warzone' or 'BF6'. For BF6 (Battlefield Redsec), 'Placement' is in 'YOUR SQUAD PLACEMENT'. Return JSON list: [{username, kills, damage, placement, mode, game}]. If not a scoreboard, return empty list." }];
            chunk.forEach(b => parts.push({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } }));

            const result = await generateContent(parts, "gemini-2.0-flash");
            const jsonMatch = result.match(/\[.*\]/s);

            if (jsonMatch) {
                const matches = JSON.parse(jsonMatch[0]);
                allMatches.push(...matches);
            }
        } catch (e) {
            log(`❌ Batch ${chunkIndex} failed: ${e.message}`);
            errors.push(`Batch ${chunkIndex}: ${e.message}`);
        }
    }

    // SILENT EXIT if no matches found in Auto Mode (e.g. Cat picture) 🤫
    if (allMatches.length === 0) {
        if (!isAutoMode) {
            await sock.sendMessage(chatJid, { text: '❌ Analysis failed: No valid scoreboard data found.' });
        } else {
            log(`🤫 [AutoScan] Ignored non-scoreboard images from ${chatJid}`);
        }
        return;
    }

    // Execute Stats Logic on Aggregated Results
    try {
        const report = await codStats.execute({ matches: allMatches }, dbUserId || 'ScanAdmin', chatJid, buffers);

        // 🧠 Intelligent Response Handling
        let isJson = false;
        let pReport = null;
        try { pReport = JSON.parse(report); isJson = true; } catch (e) { }

        if (isJson && pReport.type === 'duplicate') {
            // 🛑 DUPLICATE DETECTED
            // If Manual Mode (!isAutoMode) -> Roast Immediately
            // If Auto Mode (Resurrection/Passive) -> Return signal, let caller decide (to avoid double msg)
            if (!isAutoMode) {
                log(`♻️ [Scan] Duplicate detected. Triggering Shimon roast...`);
                const aiRoast = await shimonBrain.ask(dbUserId || 'User', 'whatsapp', "Why did you duplicate these images?", false, null, chatJid);
                await sock.sendMessage(chatJid, { text: aiRoast }, { quoted: msg });
                processor.touchBotActivity();
            } else {
                log(`♻️ [Scan] Duplicate detected (Auto Mode). Suppressing immediate roast.`);
            }
            return pReport; // ✅ Return result to caller
        }

        // Case 2: Quality/Validation Error (ROAST_ME)
        else if (typeof report === 'string' && report.startsWith('ROAST_ME:')) {
            const errorContext = report.replace('ROAST_ME:', '').trim();
            log(`📉 [Scan] Low Quality Detected: ${errorContext}`);

            if (!isAutoMode) {
                const aiRoast = await shimonBrain.ask(dbUserId || 'User', 'whatsapp', `The user sent a bad image. Roast them. Context: ${errorContext}`, false, null, chatJid);
                await sock.sendMessage(chatJid, { text: aiRoast }, { quoted: msg });
                processor.touchBotActivity();
            }

            return { type: 'error', reason: 'quality', message: errorContext };
        }

        // Case 3: Success
        else {
            // ✅ SUCCESS -> Visual Only (Reaction + Image from cod_stats)
            // User requested to REMOVE "Scan Report" text.
            log(`📊 [Scan] Report generated successfully (Silent Mode).`);
            processor.touchBotActivity();

            // React to original message to confirm processing
            if (msg.key) await sock.sendMessage(chatJid, { react: { text: "✅", key: msg.key } });

            return { type: 'success', text: report };
        }

    } catch (e) {
        if (!isAutoMode) await sock.sendMessage(chatJid, { text: `❌ Save Error: ${e.message}` });
        else log(`❌ [AutoScan] Save Error: ${e.message}`);
        return { type: 'error', message: e.message };
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

// --- 💾 Image Cache System (For Split Messages) ---
const lastImageCache = new Map();

function cacheRecentImages(chatJid, buffers) {
    log(`💾 [Cache] Storing ${buffers.length} images for ${chatJid} (2 min validity).`);
    lastImageCache.set(chatJid, {
        buffers: buffers,
        time: Date.now()
    });
}

module.exports = { downloadImages, handleVoice, handleScanCommand, handleClearCache, cacheRecentImages };
