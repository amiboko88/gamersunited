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
                log(`🧟 [Resurrection] Duplicates detected. FORCING SILENCE. 🤫`);
                return; // 🛑 HARD STOP: Do not even ask the AI. Sleep tight.
            } else if (scanResult && scanResult.reason === 'quality') {
                imageContext = `\n[SYSTEM NOTE]: The images they sent were UNREADABLE (Bad quality). Mock them for taking bad photos while you were gone.`;
            } else {
                imageContext = `\n[SYSTEM NOTE]: You also found ${buffers.length} scoreboard images they sent while you were gone. I have already processed them. Mention this.`;
            }
        }
    }

    // 4. Generate Comeback (AI Decision Layer)
    // 🕰️ Night Mode Logic
    // Default: 02:00 to 08:00 is "Sleep Time"
    const hour = new Date().getHours();
    let isNightMode = hour >= 2 && hour < 8;

    // 🎧 Discord Override: If people are validly connected to Voice, stay awake!
    try {
        const { client: discordClient } = require('../../discord');
        if (discordClient && discordClient.isReady()) {
            let voiceCount = 0;
            discordClient.guilds.cache.forEach(g => {
                // Count non-bot users in voice
                voiceCount += g.voiceStates.cache.filter(v => v.member && !v.member.user.bot).size;
            });

            if (voiceCount > 0) {
                log(`🎧 [Resurrection] Discord Active (${voiceCount} users). Overriding Night Mode! ☀️`);
                isNightMode = false;
            }
        }
    } catch (e) {
        log(`⚠️ [Resurrection] Could not check Discord state: ${e.message}`);
    }

    const prompt = `
    Context: You (Shimon) just woke up after a restart.
    Current Time: ${hour}:00 (${isNightMode ? 'NIGHT MODE 🌙' : 'DAY MODE ☀️'})
    
    MISSED CHAT TRANSCRIPT:
    ${gapMessages.map(m => `- ${m.name}: "${m.text}" ${m.hasImage ? '[SENT IMAGE]' : ''}`).join('\n')}
    ${imageContext}
    
    Task: Decide execution strategy.
    
    RULES:
    1. **IMAGES**: I have already scanned them and liked them (✅). DO NOT COMMENT on images unless the user specifically asks "Did you see this?".
       - If they just sent an image: Reply "SKIP".
    
    2. **NIGHT MODE (${isNightMode ? 'ACTIVE' : 'OFF'})**: 
       - If ACTIVE: You are asleep. Reply "SKIP" to EVERYTHING unless they explicitly tag/mention you by name.
    
    3. **INSULTS**:
       - If someone explicitly cursed YOU (Shimon/Bot) in the transcript -> ROAST THEM BACK immediately.
       - If they are cursing each other -> Reply "SKIP".
    
    4. **CASUAL CHAT**:
       - If they are just talking -> Reply "SKIP".
       - If they mention "Shimon" or "Bot" -> Reply.

    Response Format:
    - If "SKIP" -> Just write "SKIP".
    - If Replying -> Write the Hebrew response (Max 10 words, slang, sharp).
    `;

    // Use a numeric ID to pass Firestore validation (UserUtils strips non-digits)
    const comeback = await brain.ask('1010101010', 'whatsapp', prompt, true);

    if (comeback && !comeback.includes('SKIP')) {
        await sock.sendMessage(chatId, { text: comeback });
        processor.touchBotActivity(); // 🔓 Activate attention window
    } else {
        log(`🧟 [Resurrection] AI decided to stay silent (SKIP).`);
    }
}

module.exports = { execute };
