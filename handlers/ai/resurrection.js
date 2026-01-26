const { log } = require('../../utils/logger');
const brain = require('./brain');
const store = require('../../whatsapp/store');

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

    // ...

    // 2. Identify "The Gap" (Text & Images)
    const botId = sock.user?.id?.split(':')[0];

    let missedMentions = [];
    let missedImages = []; // Stores the message objects
    let lastBotReplyTime = 0;

    // Sort by time ascending
    relevantMessages.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));

    for (const msg of relevantMessages) {
        const isBot = msg.key.fromMe || (msg.key.participant && msg.key.participant.includes(botId));
        const timestamp = (msg.messageTimestamp || 0) * 1000;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const hasImage = msg.message?.imageMessage;

        if (isBot) {
            lastBotReplyTime = timestamp;
            continue;
        }

        // Only count if UNANSWERED
        if (lastBotReplyTime < timestamp) {
            const senderName = msg.pushName || msg.key.participant?.split('@')[0] || "Unknown";

            // Check for Insults/Mentions
            const cleanText = text.toLowerCase();
            const triggers = ["שמעון", "מת", "נפל", "בוט", "לא עונה", "מסנן", "מוצץ", "זבל", "איפה אתה", "תתעד", "סרוק"];

            if (triggers.some(t => cleanText.includes(t))) {
                missedMentions.push({ name: senderName, text: text });
            }

            // Check for Images
            if (hasImage) {
                missedImages.push(msg);
            }
        }
    }

    if (missedMentions.length === 0 && missedImages.length === 0) {
        log(`🧟 [Resurrection] No missed mentions or images found.`);
        return;
    }

    log(`🧟 [Resurrection] Found ${missedMentions.length} texts and ${missedImages.length} images.`);

    // 3. Process Missed Images (If any)
    let imageContext = "";
    if (missedImages.length > 0) {
        const buffers = await mediaHandler.downloadImages(missedImages, sock);
        if (buffers.length > 0) {
            // Trigger Silent Scan (Auto Mode) to save stats
            const scanResult = await mediaHandler.handleScanCommand(sock, missedImages[missedImages.length - 1], chatId, null, true, buffers, true);

            if (scanResult && scanResult.type === 'duplicate') {
                imageContext = `\n[SYSTEM NOTE]: The images they sent were DUPLICATES (User tried to spam/scam). Roast them for sending old stats while you were gone.`;
            } else {
                imageContext = `\n[SYSTEM NOTE]: You also found ${buffers.length} scoreboard images they sent while you were gone. I have already processed them. Mention this.`;
            }
        }
    }

    // 4. Generate Comeback
    const prompt = `
    Context: You (Shimon) just restarted after a crash/nap.
    
    TRANSCRIPT OF MISSED MESSAGES:
    ${missedMentions.map(m => `- ${m.name}: "${m.text}"`).join('\n')}
    ${imageContext}
    
    Task: Reply to the group.
    
    Rules:
    1. If duplicates found: Mock them ("Trying to scam me with old pics?").
    2. If valid images: Apologize sarcastically but say you captured them ("Relax, stats are safe").
    3. If only insults: Roast them back ("I heard you crying").
    4. Language: Hebrew (Slang).
    5. MAX 15 WORDS.
    `;

    // Use 'system' as user to bypass stats
    const comeback = await brain.ask('100000000000000000', 'whatsapp', prompt, true);

    if (comeback && !comeback.includes('SKIP')) {
        await sock.sendMessage(chatId, { text: comeback });
    } else {
        log(`🧟 [Resurrection] Decided to stay silent (AI: SKIP).`);
    }
}

module.exports = { execute };
