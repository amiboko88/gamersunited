// 📁 handlers/ai/tools/ranking.js
const db = require('../../../utils/firebase');

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "get_leaderboard",
            description: "Get current top players stats.",
            parameters: {
                type: "object",
                properties: { limit: { type: "integer" } }
            }
        }
    },

    async execute(args) {
        const limit = args.limit || 5;
        const snapshot = await db.collection('users').orderBy('economy.xp', 'desc').limit(limit).get();

        if (snapshot.empty) return "הלוח ריק.";

        const rows = snapshot.docs
            .filter(d => {
                const name = d.data().identity?.displayName || '';
                // Filter out broken names or test users
                return name && !name.includes('משח') && !name.includes('test') && d.data().economy?.xp > 0;
            })
            .map((d, i) => {
                const data = d.data();
                return `#${i + 1} ${data.identity?.displayName || 'Unknown'} - ${data.economy?.xp || 0} XP`;
            });

        return `🏆 **טבלת המובילים:**\n${rows.join('\n')}`;
    }
};