const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const statsCard = require('../graphics/statsCard');
const brain = require('../ai/brain');

async function executeDailyRecap(chatId, force = false) {
    try {
        log(`⏰ [DailyRecap] Starting daily recap generation...`);

        // 1. Define Time Range (Strict Calendar "Yesterday")
        const now = new Date();
        const yesterdayStart = new Date(now);
        yesterdayStart.setDate(now.getDate() - 1);
        yesterdayStart.setHours(0, 0, 0, 0);

        const yesterdayEnd = new Date(yesterdayStart);
        yesterdayEnd.setHours(23, 59, 59, 999);

        // This ensures the report covers exactly ONE DAY (the previous one)
        // regardless of what time the script runs (e.g. at noon).
        log(`📅 [DailyRecap] Range: ${yesterdayStart.toLocaleString()} - ${yesterdayEnd.toLocaleString()}`);

        // 2. Fetch ALL Users
        const usersSnap = await db.collection('users').get();
        let aggregatedStats = [];

        for (const doc of usersSnap.docs) {
            const userData = doc.data();
            const name = userData.identity?.displayName || doc.id.substring(0, 5);

            // Fetch games in range
            const gamesSnap = await doc.ref.collection('games')
                .where('timestamp', '>=', yesterdayStart)
                .where('timestamp', '<=', yesterdayEnd)
                .get();

            if (!gamesSnap.empty) {
                let player = {
                    username: name,
                    kills: 0,
                    damage: 0,
                    score: 0,
                    matches: 0
                };

                gamesSnap.forEach(g => {
                    const d = g.data();
                    player.kills += (parseInt(d.kills) || 0);
                    player.damage += (parseInt(d.damage) || 0);
                    player.score += (parseInt(d.score) || 0);
                    player.matches++;
                });

                aggregatedStats.push(player);
            }
        }

        if (aggregatedStats.length === 0) {
            log(`⚠️ [DailyRecap] No games found in the last 24h.`);
            if (force && chatId) {
                // Determine if we have access to sock via a callback or require
                const { getWhatsAppSock } = require('../../whatsapp/index');
                const sock = getWhatsAppSock();
                if (sock) await sock.sendMessage(chatId, { text: "😴 הנובים ישנים? אין משחקים ביממה האחרונה." });
            }
            return;
        }

        // 3. Generate Image
        log(`📸 [DailyRecap] Generating summary card for ${aggregatedStats.length} players...`);
        const imageBuffer = await statsCard.generateMatchCard(aggregatedStats, {
            isAggregated: true,
            totalGames: aggregatedStats.reduce((acc, curr) => acc + curr.matches, 0)
        });

        if (!imageBuffer) {
            log(`❌ [DailyRecap] Failed to generate image.`);
            return;
        }

        // 4. Generate AI Caption
        let caption = "📊 **Daily War Report**";
        try {
            const topPlayer = aggregatedStats.sort((a, b) => b.kills - a.kills)[0];
            const accKills = aggregatedStats.reduce((a, b) => a + b.kills, 0);

            const prompt = `
            You are Shimon, the toxic Commander.
            Write a SHORT, ENERGETIC, HEBREW SLANG daily report summary.
            
            Stats:
            - Total Kills by Squad: ${accKills}
            - MVP: ${topPlayer.username} (${topPlayer.kills} Kills)
            - Players Active: ${aggregatedStats.length}
            
            Tone: High energy, military briefing style but with street slang. 
            If kills are low (<50), roast them. If high (>100), be proud but toxic.
            Max 2 sentences.
            `;

            const aiText = await brain.generateInternal(prompt);
            if (aiText) caption = aiText.replace(/"/g, '');
        } catch (e) {
            log(`⚠️ [DailyRecap] AI Caption failed: ${e.message}`);
        }

        // 5. Send to Group (chatId must be provided by scheduler or config)
        // If chatId is not passed, use default from config or look it up
        const targetChat = chatId || process.env.WHATSAPP_MAIN_GROUP_ID;

        if (targetChat) {
            const { getWhatsAppSock } = require('../../whatsapp/index');
            const sock = getWhatsAppSock();
            if (sock) {
                await sock.sendMessage(targetChat, {
                    image: imageBuffer,
                    caption: caption
                });
                log(`✅ [DailyRecap] Sent report to ${targetChat}`);
            } else {
                log(`❌ [DailyRecap] Socket unavailable.`);
            }
        } else {
            log(`⚠️ [DailyRecap] No target chat ID configured.`);
        }

    } catch (error) {
        log(`❌ [DailyRecap] Critical Error: ${error.message}`);
    }
}

module.exports = { executeDailyRecap };
