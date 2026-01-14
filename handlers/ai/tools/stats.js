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

        // Debug: See who is asking
        console.log(`[Stats Tool] Request from: ${userId} | Tag: ${targetTag}`);

        // 1. תיקון טעות נפוצה של ה-AI: אם שלח את שם הבוט במקום "me"
        const botNames = ['shimon', 'שמעון', 'bot', 'בוט', 'shimons'];
        if (botNames.some(name => targetTag.toLowerCase().includes(name))) {
            targetTag = 'me';
        }

        // 2. מיפוי משתמשים (User Mapping)
        if (targetTag.toLowerCase() === 'me' || targetTag.includes('אני')) {
            // בדיקה גמישה: אם זה המנהל (וואטסאפ או דיסקורד)
            const isAdmin = userId.includes('972526800647') ||
                userId.includes('iBoko') ||
                userId.includes('Ami') ||
                userId.length > 15; // Discord IDs are long

            if (isAdmin) {
                // עדכון ל-Activision ID שהמשתמש סיפק (זה הכי אמין)
                targetTag = 'AMI#1787344';
                platform = 'acti';
                // הערה: הבוט ינסה אוטומטית גם battle אם acti ייכשל, אבל נתחיל מהנכון.
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
