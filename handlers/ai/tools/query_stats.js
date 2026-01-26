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
                period: { type: "string", enum: ["today", "week", "all"], description: "Time period filter." }
            },
            required: []
        }
    }
};

async function execute(args, userId, chatId) {
    try {
        const limit = args.limit || 5;
        let queryDate = new Date();

        if (args.period === 'week') queryDate.setDate(queryDate.getDate() - 7);
        else if (args.period === 'all') queryDate = new Date(0);
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
            // Global Query (Requires Collection Group Index usually, but we can try specific recent active users)
            // Implementation: Scan active users (expensive but safer without index)
            const activeSnap = await db.collection('users').where('meta.lastActive', '>=', queryDate.toISOString()).get();

            for (const doc of activeSnap.docs) {
                const games = await doc.ref.collection('games')
                    .where('timestamp', '>=', queryDate)
                    .orderBy('timestamp', 'desc')
                    .limit(2) // Small limit per user for global
                    .get();

                games.forEach(g => stats.push({ ...g.data(), username: doc.data().identity?.displayName }));
            }

            // Sort global results
            stats.sort((a, b) => b.timestamp - a.timestamp);
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
