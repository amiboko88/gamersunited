// 📁 handlers/ai/tools/games.js
const casinoSystem = require('../../economy/casino');
const rouletteSystem = require('../../economy/roulette');

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "play_games",
            description: "Execute casino games (Roulette, Betting/Gambling). Use when user wants to gamble or spin roulette.",
            parameters: {
                type: "object",
                properties: {
                    game_type: { type: "string", enum: ["roulette", "bet"] },
                    amount: { type: "integer", description: "Bet amount (only for betting)" },
                    prediction: { type: "string", description: "What to bet on (e.g. 'red', 'black', '5')" }
                },
                required: ["game_type"]
            }
        }
    },

    async execute(args, userId) {
        // גישה לוואטסאפ לשליחת מדיה
        const { getWhatsAppSock } = require('../../../whatsapp/index');
        const sock = getWhatsAppSock();
        const mainGroupId = process.env.WHATSAPP_MAIN_GROUP_ID;

        // --- רולטה ---
        if (args.game_type === 'roulette') {
            const result = await rouletteSystem.spinRoulette();
            
            if (sock && mainGroupId && result) {
                // שליחת המדיה ישירות לקבוצה
                if (result.type === 'sticker') {
                    await sock.sendMessage(mainGroupId, { sticker: { url: result.path } });
                } else {
                    await sock.sendMessage(mainGroupId, { video: { url: result.url }, gifPlayback: true });
                }
                return "סובבתי את הרולטה, התוצאה נשלחה לקבוצה.";
            }
            return "משהו נתקע ברולטה.";
        }

        // --- הימורים ---
        if (args.game_type === 'bet') {
            // בניית פקודת טקסט וירטואלית למערכת הקזינו הקיימת
            const virtualText = `הימור ${args.amount || 0} על ${args.prediction || ''}`;
            const betRes = await casinoSystem.placeBet(userId, "Gamer", 'whatsapp', virtualText);
            
            if (betRes.status === 'success' && sock && mainGroupId) {
                if (betRes.asset.endsWith('.mp4')) {
                    await sock.sendMessage(mainGroupId, { video: { url: betRes.asset }, caption: betRes.caption, gifPlayback: true });
                } else {
                    await sock.sendMessage(mainGroupId, { text: betRes.caption });
                }
                return "ההימור התקבל, התוצאה נשלחה.";
            }
            return betRes.message || "שגיאה בהימור.";
        }
    }
};