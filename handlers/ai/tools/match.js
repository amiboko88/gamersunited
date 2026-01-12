// 📁 handlers/ai/tools/match.js
const gameManager = require('../../economy/gameManager');

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "match_control",
            description: "Manage LIVE gaming matches, scorekeeping, and betting.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["start", "update_score", "bet", "end"] },
                    p1: { type: "string", description: "Player 1 name" },
                    p2: { type: "string", description: "Player 2 name" },
                    target: { type: "string", description: "Who? (Winner / Scorer / Bet Target)" },
                    amount: { type: "integer", description: "Bet amount / Score increment (1)" }
                },
                required: ["action"]
            }
        }
    },

    async execute(args, userId, chatId) {
        if (args.action === 'start') {
            return await gameManager.startMatch(args.p1, args.p2, chatId);
        }
        if (args.action === 'update_score') {
            const inc = args.amount || 1;
            return await gameManager.updateScore(args.target, inc);
        }
        if (args.action === 'bet') {
            return await gameManager.placeBet(userId, args.amount, args.target);
        }
        if (args.action === 'end') {
            return await gameManager.endMatch(args.target);
        }
    }
};