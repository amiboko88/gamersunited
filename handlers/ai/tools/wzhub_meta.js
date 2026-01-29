const browser = require('../../intel/adapters/browser');
const { log } = require('../../../utils/logger');

const definition = {
    type: "function",
    function: {
        name: "get_meta_loadouts",
        description: "Get the absolute best Warzone Meta Weapons/Loadouts from WZHUB. Use this when asked for 'Best Guns', 'Meta', 'Loadouts', 'What to play'.",
        parameters: {
            type: "object",
            properties: {
                mode: {
                    type: "string",
                    enum: ["Battle Royale", "Resurgence", "Ranked"],
                    description: "The game mode. Map 'Batel' or 'Rebirth' to 'Resurgence'."
                },
                game: {
                    type: "string",
                    enum: ["Warzone", "MW3", "BF6"],
                    description: "The game title.",
                    default: "Warzone"
                },
                weapon: {
                    description: "Optional: Specific weapon name to get detailed loadout for (e.g. 'DRS-IAR', 'M4')."
                },
                tier: {
                    type: "string",
                    enum: ["Absolute", "Meta"],
                    description: "The targeted meta tier. Default 'Absolute'. Use 'Meta' ONLY if user specifically requests it (not absolute)."
                }
            },
            required: ["mode"]
        }
    }
};

const intelManager = require('../../intel/manager');

async function execute(args) {
    const { mode, game, chatId, weapon } = args;
    log(`🔫 [Tool] Fetching Meta via IntelManager for ${game} (Weapon: ${weapon || 'All'})...`);

    try {
        // 1. Construct Query for IntelManager
        let query = "Absolute Meta"; // Default

        const isBatel = game && (game.toUpperCase().includes('BF6') || game.toUpperCase().includes('BATEL'));

        if (weapon) {
            query = weapon;
        } else if (isBatel) {
            query = "BF6 Meta"; // Triggers BF6 fallback list
        } else if (args.tier === 'Meta') {
            query = "Meta";
        }

        // 2. Call Manager
        const result = await intelManager.getMeta(query);

        if (!result) {
            return "❌ No meta data found at this moment.";
        }

        // 3. Handle Visual Response (Image)
        if (result.image) {
            const { getWhatsAppSock } = require('../../../whatsapp/index');
            const sock = getWhatsAppSock();

            if (sock && chatId) {
                // Determine Mimetype (Buffer or URL)
                const imgContent = Buffer.isBuffer(result.image) ? result.image : { url: result.image };

                await sock.sendMessage(chatId, {
                    image: imgContent,
                    caption: result.text || `🔫 **${query.toUpperCase()} Loadouts**`,
                    mimetype: 'image/png'
                });

                // If specific code exists
                if (result.code) {
                    setTimeout(() => sock.sendMessage(chatId, { text: result.code }), 500);
                }

                return `[RESPONSE_SENT] Successfully sent visual loadout for ${query}.`;
            }

            // Fallback if no socket (Test mode)
            return "[SUCCESS] Image generated but no socket to send.";
        }

        // 4. Handle Text Response
        if (result.text) {
            return result.text;
        }

        return "❌ Data format error.";

    } catch (e) {
        log(`❌ [Tool] Error: ${e.message}`);
        return "Failed to fetch meta loadouts.";
    }
}

module.exports = { definition, execute };
