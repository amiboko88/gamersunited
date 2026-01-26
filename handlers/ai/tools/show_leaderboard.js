const db = require('../../../utils/firebase');
const { log } = require('../../../utils/logger');
const leaderboardGraphics = require('../../../handlers/graphics/leaderboard');

const definition = {
    type: "function",
    function: {
        name: "show_cod_leaderboard",
        description: "Show the WARZONE / COD Leaderboard Image (Kills, Damage, Wins). ⚠️ RESTRICTION: Use ONLY when explicitly asked for 'Warzone', 'COD', or 'Shooting' stats. If user just says 'Table', 'Rankings', or 'Who is best' WITHOUT context -> DO NOT CALL. Ask for clarification.",
        parameters: {
            type: "object",
            properties: {
                period: { type: "string", enum: ["week", "all", "yesterday"], description: "Time period (Default: week)." },
                stat: { type: "string", enum: ["kills", "damage", "score", "matches"], description: "Sort by which stat? (Default: score)" }
            },
            required: []
        }
    }
};

async function execute(args, userId, chatId) {
    try {
        const period = args.period || 'week';
        const sortStat = args.stat || 'score';

        // 1. Determine Date Range
        let queryDate = new Date();
        let periodText = "Last 7 Days";

        if (period === 'all') {
            queryDate = new Date(0);
            periodText = "All Time Legends";
        } else if (period === 'yesterday') {
            queryDate.setDate(queryDate.getDate() - 1);
            queryDate.setHours(0, 0, 0, 0);
            periodText = "Yesterday's Heroes";
        } else {
            queryDate.setDate(queryDate.getDate() - 7); // Default Week
        }

        log(`🏆 [Leaderboard] Generating ${period} table (Sort: ${sortStat})...`);

        // 2. Fetch Data (Aggregated from all users)
        // Optimization: We fetch all users, then top 3 games per user in rang, then aggregate.
        // For a true "Leaderboard", we usually want "Summary Stats" (Total Kills over period).
        // But our DB stores "Games".
        // SO: We must fetch ALL games for the period and sum them up per user.

        const usersSnap = await db.collection('users').get();
        let playerStats = new Map(); // <Name, {kills, damage, matches, score, avatar}>

        const promises = usersSnap.docs.map(async doc => {
            const userData = doc.data();
            const name = userData.identity?.displayName || "Unknown";
            const avatar = userData.identity?.avatar || userData.identity?.avatar_discord || "https://cdn.discordapp.com/embed/avatars/0.png";

            // Limit to recent 50 games to avoid explosion, or just get all for accurate stats?
            // "Week" can have many games. Let's get up to 50.
            const games = await doc.ref.collection('games')
                .where('timestamp', '>=', queryDate)
                .limit(50)
                .get();

            if (!games.empty) {
                let p = { name, avatar, kills: 0, damage: 0, matches: 0, score: 0 };

                games.forEach(g => {
                    const d = g.data();
                    p.kills += (parseInt(d.kills) || 0);
                    p.damage += (parseInt(d.damage) || 0);
                    p.score += (parseInt(d.score) || 0);
                    p.matches++;
                });

                // Calculate KDR if deaths available? (We assume deaths=matches if not tracked, rough estimate or ignore)
                // We'll just show Kills/Damage/Score/Matches
                p.kdr = (p.kills / (p.matches || 1)).toFixed(2); // Avg Kills per Match actually

                return p;
            }
            return null;
        });

        const results = await Promise.all(promises);
        const players = results.filter(p => p !== null);

        if (players.length === 0) return "No games found for this period.";

        // 3. Sort
        players.sort((a, b) => b[sortStat] - a[sortStat]);

        // 4. Top 10 Only
        const topPlayers = players.slice(0, 10);

        // 5. Generate Graphics
        const imageBuffer = await leaderboardGraphics.generateCODLeaderboard(topPlayers, periodText);

        if (!imageBuffer) return "Failed to generate image.";

        // 6. Return Data for Brain to Send
        // The Brain usually sends text. We need to handle Image return.
        // We will return a special object that the Brain handler understands, OR use the tool to send directly.
        // Tools usually return TEXT to the AI.
        // If we want to send an image, we should do it here using 'sock'.

        // But `sock` is not passed to `execute` in the current `brain.js` architecture (it passes `userId, chatId`).
        // We can require `whatsapp/index.js` to get the socket! 

        const { getWhatsAppSock } = require('../../../whatsapp/index');
        const sock = getWhatsAppSock();

        if (sock && chatId) {
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: `🏆 **${periodText} Leaderboard**\nSorted by: ${sortStat.toUpperCase()}`
            });
            return "[RESPONSE_SENT] Displaying leaderboard image.";
        } else {
            return "Error: Socket unavailable.";
        }

    } catch (error) {
        log(`❌ [Leaderboard] Error: ${error.message}`);
        return `Error generating leaderboard: ${error.message}`;
    }
}

module.exports = { definition, execute };
