const { log } = require('../../utils/logger');
const brain = require('./brain');
const store = require('../../whatsapp/store');
const processor = require('../../whatsapp/logic/processor'); // 🔌 Link to attention system

// 🧊 In-memory Cool-down (Prevent reconnect spam)
let lastResurrectionTime = 0;
const RESURRECTION_COOLDOWN = 15 * 60 * 1000; // 15 Minutes

/**
 * 🧟 Resurrection Protocol
 * Checks for messages missed during downtime (or crash) and insults the users retrospectively.
 */
async function execute(sock, chatId) {
    if (!chatId) return;

    // 🛡️ Cool-down Check
    const now = Date.now();
    if (now - lastResurrectionTime < RESURRECTION_COOLDOWN) {
        log(`🧟 [Resurrection] Skipping: System recently triggered (${Math.round((now - lastResurrectionTime) / 1000)}s ago).`);
        return;
    }
    lastResurrectionTime = now;

    // Wait a bit for history to hydrate
    await new Promise(r => setTimeout(r, 15000));

    log(`🧟 [Resurrection] Scanning history for missed insults in ${chatId}...`);

    const messages = store.getMessages(chatId);
    if (!messages || messages.length === 0) {
        log(`🧟 [Resurrection] No history found.`);
        return;
    }
    // 1. Filter Timeline
    // Look for messages from the last 12 hours (Crash/Sleep protection)
    const LOOKBACK_WINDOW = 12 * 60 * 60 * 1000;

    const relevantMessages = messages.filter(m => {
        const msgTime = (m.messageTimestamp || 0) * 1000;
        return (now - msgTime) < LOOKBACK_WINDOW;
    });

    if (relevantMessages.length === 0) return;

    const mediaHandler = require('../../whatsapp/logic/media_handler');

    // 2. Identify "The Gap" (Text & Images)
    const botId = sock.user?.id?.split(':')[0];

    // Collect ALL unread messages during the gap
    let gapMessages = [];

    // Sort by time ascending
    relevantMessages.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));

    for (const msg of relevantMessages) {
        const sender = msg.key.participant || msg.key.remoteJid;
        const isBot = msg.key.fromMe || (sender && sender.includes(botId));

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const hasImage = msg.message?.imageMessage;

        if (isBot) {
            // 🧹 Bot replied? Clear pending "gap" messages (they were handled)
            gapMessages = [];
            continue;
        }

        const senderName = msg.pushName || sender?.split('@')[0] || "Unknown";

        // 🧠 Collect Context (Potential Gap)
        if (text || hasImage) {
            gapMessages.push({
                name: senderName,
                text: text,
                hasImage: !!hasImage,
                msgFunc: msg
            });
        }
    }

    if (gapMessages.length === 0) {
        log(`🧟 [Resurrection] No unread gap messages found.`);
        return;
    }

    log(`🧟 [Resurrection] Analyzing ${gapMessages.length} gap messages with AI...`);

    // 3. Process Missed Images (If any)
    let imageContext = "";
    const imagesToProcess = gapMessages.filter(m => m.hasImage).map(m => m.msgFunc);

    if (imagesToProcess.length > 0) {
        const buffers = await mediaHandler.downloadImages(imagesToProcess, sock);
        if (buffers.length > 0) {
            // Trigger Silent Scan (Auto Mode) to save stats
            const scanResult = await mediaHandler.handleScanCommand(sock, imagesToProcess[imagesToProcess.length - 1], chatId, null, true, buffers, true);

            if (scanResult && scanResult.type === 'duplicate') {
                log(`🧟 [Resurrection] Duplicates detected. FORCING SILENCE. 🤫`);
                return; // 🛑 HARD STOP
            } else if (scanResult && scanResult.reason === 'quality') {
                imageContext = `\n[SYSTEM NOTE]: The images they sent were UNREADABLE (Bad quality). Mock them.`;
            } else {
                imageContext = `\n[SYSTEM NOTE]: You also found ${buffers.length} scoreboard images they sent. I have already processed them. Mention this.`;
            }
        }
    }

    // 4. Generate Comeback (AI Decision Layer)
    // 🕰️ Night Mode Logic
    // Shifted to 00:00 to 08:00 (Sleep Time) to avoid late night disruptions
    const hour = new Date().getHours();
    let isNightMode = hour >= 0 && hour < 8;

    // 🎧 Discord Override
    try {
        const { client: discordClient } = require('../../discord');
        if (discordClient && discordClient.isReady()) {
            let voiceCount = 0;
            discordClient.guilds.cache.forEach(g => {
                voiceCount += g.voiceStates.cache.filter(v => v.member && !v.member.user.bot).size;
            });

            if (voiceCount > 0) {
                log(`🎧 [Resurrection] Discord Active (${voiceCount} users). Overriding Night Mode! ☀️`);
                isNightMode = false;
            }
        }
    } catch (e) {
        log(`⚠️ [Resurrection] Discord check fail: ${e.message}`);
    }

    const prompt = `
    Context: You (Shimon) just woke up after a restart.
    Current Time: ${hour}:00 (${isNightMode ? 'NIGHT MODE 🌙' : 'DAY MODE ☀️'})
    
    MISSED CHAT TRANSCRIPT:
    ${gapMessages.map(m => `- ${m.name}: "${m.text}" ${m.hasImage ? '[SENT IMAGE]' : ''}`).join('\n')}
    ${imageContext}
    
    RULES:
    1. **NIGHT MODE (${isNightMode ? 'ACTIVE' : 'OFF'})**: 
       - If ACTIVE: Reply "SKIP" to EVERYTHING unless they explicitly tag/mention you. You are asleep.
    
    2. **INSULTS**:
       - Only Roast if they cursed YOU (Shimon/Bot) or if they were being exceptionally toxic while you were away.
    
    3. **CASUAL**:
       - If they are just talking or sent images without asking you -> Reply "SKIP".

    Response Format:
    - If "SKIP" -> Just write "SKIP".
    - If Replying -> Write the Hebrew response (Max 10 words). You MAY use [VOICE] prefix for audio.
    `;

    const comeback = await brain.ask('1010101010', 'whatsapp', prompt, true);

    if (comeback && !comeback.includes('SKIP')) {
        log(`🧟 [Resurrection] Sending comeback: "${comeback.substring(0, 30)}..."`);

        // 🎙️ Voice & Execution Fix
        const lastMsg = gapMessages[gapMessages.length - 1].msgFunc;
        const playedVoice = await mediaHandler.handleVoice(comeback, sock, chatId, lastMsg);

        if (playedVoice !== true) {
            const textToSend = playedVoice || comeback;
            await sock.sendMessage(chatId, { text: textToSend });
        }
        processor.touchBotActivity();
    } else {
        log(`🧟 [Resurrection] AI decided to stay silent (SKIP).`);
    }
}

module.exports = { execute };
