// 📁 handlers/ai/tools/stats.js
const codHandler = require('../../gaming/cod');

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "get_warzone_stats",
            description: "Get Call of Duty Warzone Resurgence stats for a player.",
            parameters: {
                type: "object",
                properties: {
                    gamertag: { type: "string", description: "Battle.net ID (User#1234), PSN ID, or 'me'" },
                    platform: { type: "string", enum: ["battle", "psn", "xbl", "uno"], description: "Platform (default: battle)" },
                    type: { type: "string", enum: ["profile", "last_match"], description: "Fetch full profile or just the last match" }
                },
                required: ["gamertag"]
            }
        }
    },

    async execute(args, userId, chatId) {
        let targetTag = args.gamertag;
        let platform = args.platform || 'battle';

        // 1. מיפוי משתמשים (User Mapping)
        if (targetTag.toLowerCase() === 'me' || targetTag.includes('אני')) {
            // בדיקה גמישה: אם זה המנהל (וואטסאפ או דיסקורד)
            // נניח שכל ID שאינו מספרי קצר הוא אולי דיסקורד.
            // ליתר ביטחון, נאשר גם אם ה-ID מכיל את השם Ami או iBoko (תלוי איך מערכת ה-AI מעבירה את ה-ID)
            const isAdmin = userId.includes('972526800647') ||
                userId.includes('iBoko') ||
                userId.length > 15; // Discord IDs are long snowflakes

            if (isAdmin) {
                targetTag = 'iBoko#21414';
                platform = 'battle';
            } else {
                return "❌ Sorry, I don't know your gamertag yet. Tell me 'My gamertag is X'.";
            }
        }

        // 2. משחק אחרון (Last Match)
        if (args.type === 'last_match') {
            const match = await codHandler.getRecentMatch(targetTag, platform);
            if (!match) return `❌ No recent match found for **${targetTag}**. Privacy settings?`;

            return `
🎮 **Last Match Report (Warzone):**
🗺️ **Map:** ${match.map} | **Mode:** ${match.mode}
📊 **Placement:** #${match.placement}
🔫 **Kills:** ${match.kills} | **Deaths:** ${match.deaths}
📉 **K/D:** ${match.kdRatio}
💥 **Damage:** ${match.damage}
⏰ **Time:** ${match.time}
            `.trim();
        }

        // 3. פרופיל מלא (Profile)
        const stats = await codHandler.getWarzoneStats(targetTag, platform);
        if (!stats) {
            return `❌ No stats found for **${targetTag}**. Check if profile is PUBLIC or Gamertag is correct.`;
        }

        return `
📊 **Warzone Stats (Resurgence):**
👤 **Player:** ${stats.username}
🔫 **Kills:** ${stats.kills}
💀 **Deaths:** ${stats.deaths}
📉 **K/D Ratio:** ${stats.kdRatio}
🏆 **Wins:** ${stats.wins}
🎮 **Games:** ${stats.gamesPlayed}
⏱️ **Time Played:** ${stats.timePlayed}
        `.trim();
    }
};
