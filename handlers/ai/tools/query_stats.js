const db = require('../../../utils/firebase');
const { log } = require('../../../utils/logger');

const definition = {
    type: "function",
    function: {
        name: "query_cod_stats",
        description: "Fetch recent COD/Warzone stats for a specific user or the whole server. Use this to answer questions like 'How did I play yesterday?' or 'Who played the best today?'.",
        parameters: {
            type: "object",
            properties: {
                targetUser: { type: "string", description: "The specific user ID or Name to query. If null, query widely." },
                limit: { type: "integer", description: "Max number of games to retrieve (Default 5)." },
                period: { type: "string", enum: ["today", "yesterday", "week", "all"], description: "Time period filter." },
                days: { type: "integer", description: "Number of past days to fetch (e.g. 2 for last 48h)." }
            },
            required: []
        }
    }
};

async function execute(args, userId, chatId) {
    try {
        const limit = args.limit || 5;
        let queryDate = new Date();

        if (args.days) {
            queryDate.setDate(queryDate.getDate() - args.days);
            queryDate.setHours(0, 0, 0, 0);
        }
        else if (args.period === 'week') queryDate.setDate(queryDate.getDate() - 7);
        else if (args.period === 'all') queryDate = new Date(0);
        else if (args.period === 'yesterday') {
            queryDate.setDate(queryDate.getDate() - 1);
            queryDate.setHours(0, 0, 0, 0); // Start of Yesterday
        }
        else queryDate.setHours(0, 0, 0, 0); // Default: Today

        let stats = [];

        // 1. Resolve Target User
        let targetId = userId; // Default to self
        let targetName = "Unknown";

        if (args.targetUser) {
            // Try to find user by name/alias
            const usersSnap = await db.collection('users').get();
            const found = usersSnap.docs.find(doc => {
                const d = doc.data();
                const aliases = [
                    d.identity?.battleTag,
                    d.identity?.discordName,
                    d.identity?.displayName,
                    ...(d.identity?.aliases || [])
                ].filter(Boolean).map(a => a.toLowerCase());
                return aliases.some(a => a.includes(args.targetUser.toLowerCase()));
            });

            if (found) {
                targetId = found.id;
                targetName = found.data().identity?.displayName;
            } else if (args.targetUser.toLowerCase() === 'everyone' || args.targetUser.toLowerCase() === 'all') {
                targetId = null; // Wide query
            }
        }

        // 2. Fetch Games
        if (targetId) {
            // Specific User
            const gamesSnap = await db.collection('users').doc(targetId).collection('games')
                .where('timestamp', '>=', queryDate)
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();

            gamesSnap.forEach(doc => stats.push({ ...doc.data(), username: targetName }));
        } else {
            // Global Query - Scan ALL users (Safe for <500 users, we have ~60)
            // We removed 'meta.lastActive' filter because it might exclude silent gamers.
            const usersSnap = await db.collection('users').get();

            // Parallelize the subcollection queries for speed
            const promises = usersSnap.docs.map(async doc => {
                const games = await doc.ref.collection('games')
                    .where('timestamp', '>=', queryDate)
                    .orderBy('timestamp', 'desc')
                    .limit(3) // Get top 3 per user
                    .get();

                return games.docs.map(g => ({ ...g.data(), username: doc.data().identity?.displayName }));
            });

            const results = await Promise.all(promises);
            stats = results.flat();

            // Sort global results by time desc
            stats.sort((a, b) => {
                const tA = a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                const tB = b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
                return tB - tA;
            });

            stats = stats.slice(0, limit);
        }

        if (stats.length === 0) {
            return "No games found for this period.";
        }

        // 3. Format for AI
        return JSON.stringify(stats.map(s => ({
            player: s.username,
            kills: s.kills,
            damage: s.damage,
            place: s.placement,
            time: s.timestamp.toDate().toLocaleString('he-IL')
        })));

    } catch (error) {
        log(`❌ [QueryStats] Error: ${error.message}`);
        return "Error fetching stats.";
    }
}

module.exports = { definition, execute };
