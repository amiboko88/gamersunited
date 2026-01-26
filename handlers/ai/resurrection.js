const { log } = require('../../utils/logger');
const brain = require('./brain');
const store = require('../../whatsapp/store');
const processor = require('../../whatsapp/logic/processor'); // 🔌 Link to attention system

/**
 * 🧟 Resurrection Protocol
 * Checks for messages missed during downtime (or crash) and insults the users retrospectively.
 */
async function execute(sock, chatId) {
    if (!chatId) return;

    // Wait a bit for history to hydrate
    await new Promise(r => setTimeout(r, 5000));

    log(`🧟 [Resurrection] Scanning history for missed insults in ${chatId}...`);

    const messages = store.getMessages(chatId);
    if (!messages || messages.length === 0) {
        log(`🧟 [Resurrection] No history found.`);
        return;
    }
    // 1. Filter Timeline
    // Look for messages from the last 12 hours (Crash/Sleep protection)
    const LOOKBACK_WINDOW = 12 * 60 * 60 * 1000;
    const now = Date.now();

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
        const isBot = msg.key.fromMe || (msg.key.participant && msg.key.participant.includes(botId));
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const hasImage = msg.message?.imageMessage;

        if (isBot) {
            // 🧹 Bot replied? Clear pending "gap" messages (they were handled)
            // This prevents "Double Replying" to messages the bot already answered before the crash.
            gapMessages = [];
            continue;
        }

        const senderName = msg.pushName || msg.key.participant?.split('@')[0] || "Unknown";

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
                imageContext = `\n[SYSTEM NOTE]: The images they sent were DUPLICATES (User tried to spam/scam). Roast them for sending old stats while you were gone.`;
            } else if (scanResult && scanResult.reason === 'quality') {
                imageContext = `\n[SYSTEM NOTE]: The images they sent were UNREADABLE (Bad quality). Mock them for taking bad photos while you were gone.`;
            } else {
                imageContext = `\n[SYSTEM NOTE]: You also found ${buffers.length} scoreboard images they sent while you were gone. I have already processed them. Mention this.`;
            }
        }
    }

    // 4. Generate Comeback (AI Decision Layer)
    const prompt = `
    Context: You (Shimon) just woke up after a restart/crash.
    
    MISSED CHAT TRANSCRIPT:
    ${gapMessages.map(m => `- ${m.name}: "${m.text}" ${m.hasImage ? '[SENT IMAGE]' : ''}`).join('\n')}
    ${imageContext}
    
    Task: Decide if you need to reply.
    - If they completely ignored you / General chat: Reply "SKIP".
    - If they mentioned you, the bot, the crash, or sent images: Reply.
    
    Response Rules (If replying):
    1. Tone: Cool, dismissive, Hebrew Slang.
    2. If images involved: Use the [SYSTEM NOTE] context (Roast for duplicates/bad quality, or specific confirmation).
    3. If they insulted you ("bot fell"): Roast them back.
    4. MAX 15 WORDS.
    `;

    // Use 'system_resurrection' as user to bypass stats logic but keep memory context
    const comeback = await brain.ask('system_resurrection', 'whatsapp', prompt, true);

    if (comeback && !comeback.includes('SKIP')) {
        await sock.sendMessage(chatId, { text: comeback });
        processor.touchBotActivity(); // 🔓 Activate attention window
    } else {
        log(`🧟 [Resurrection] AI decided to stay silent (SKIP).`);
    }
}

module.exports = { execute };
