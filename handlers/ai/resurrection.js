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
    // Look for messages from the last 60 minutes
    const ONE_HOUR = 60 * 60 * 1000;
    const now = Date.now();

    const relevantMessages = messages.filter(m => {
        const msgTime = (m.messageTimestamp || 0) * 1000;
        return (now - msgTime) < ONE_HOUR; // Only recent history
    });

    if (relevantMessages.length === 0) return;

    // 2. Identify "The Gap"
    // Find messages that mention Shimon but have NO Bot Reply after them
    const botId = sock.user?.id?.split(':')[0];

    let missedMentions = [];
    let lastBotReplyTime = 0;

    // Sort by time ascending
    relevantMessages.sort((a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));

    for (const msg of relevantMessages) {
        const isBot = msg.key.fromMe || (msg.key.participant && msg.key.participant.includes(botId));
        const timestamp = (msg.messageTimestamp || 0) * 1000;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

        if (isBot) {
            lastBotReplyTime = timestamp;
            continue;
        }

        // Check for triggers regarding Shimon Death/Status
        const cleanText = text.toLowerCase();
        const triggers = ["שמעון", "מת", "נפל", "בוט", "לא עונה", "מסנן", "מוצץ", "זבל", "איפה אתה"];

        if (triggers.some(t => cleanText.includes(t))) {
            // Check if this specific message got a reply LATER?
            // Heuristic: If lastBotReplyTime > timestamp, we probably answered it (or something else).
            // But if the bot replied 10 mins ago, and this msg is 5 mins ago, and no bot reply since...
            // Then it is UNANSWERED.
            if (lastBotReplyTime < timestamp) {
                const senderName = msg.pushName || msg.key.participant?.split('@')[0] || "Unknown";
                missedMentions.push({ name: senderName, text: text });
            }
        }
    }

    if (missedMentions.length === 0) {
        log(`🧟 [Resurrection] No missed mentions found.`);
        return;
    }

    log(`🧟 [Resurrection] Found ${missedMentions.length} missed messages. Revenge time.`);

    // 3. Generate Comeback
    const prompt = `
    Context: You (Shimon) just crashed/restarted. You were offline for a while.
    While you were "dead", the users in the group were talking about you.
    
    TRANSCRIPT OF MISSED MESSAGES:
    ${missedMentions.map(m => `- ${m.name}: "${m.text}"`).join('\n')}
    
    Task: Write ONE single message to the group.
    1. Acknowledge you are back ("I'm alive").
    2. Roast the specific people who talked trash while you were gone ("I heard you, Omri").
    3. Explain (jokingly) that you were just upgrading your brain or taking a nap.
    
    Tone: Menacing but funny.
    Language: Hebrew (Slang).
    `;

    // Use 'system' as user to bypass stats
    const comeback = await brain.ask('100000000000000000', 'whatsapp', prompt, true);

    if (comeback) {
        await sock.sendMessage(chatId, { text: comeback });
    }
}

module.exports = { execute };
