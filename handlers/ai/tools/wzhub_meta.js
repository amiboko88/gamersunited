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

async function execute(args) {
    const { mode, game, chatId } = args;
    log(`🔫 [WZHUB] Fetching Meta for ${game} - ${mode}...`);

    try {
        // Map mode to URL
        // Probed & Verified: https://wzhub.gg/meta is reliable.
        // Tabs are SPA-based, so for now we stick to the main page which usually shows proper meta.

        // Note: Specific mode scraping requires clicking buttons, 
        // which is risky. We start with global meta.

        let url, selector, title;

        // "Batel" / "Redsec" / "BF6" -> BFHUB (Project Redsec / Delta Force / BF6)
        const isBatel = game.toUpperCase().includes('BF6') || game.toUpperCase().includes('BATEL') || mode.toUpperCase().includes('BATEL') || mode.toUpperCase().includes('REDSEC');

        if (isBatel || mode === 'Ranked') {
            // BF6 / Batel Request -> BFHUB
            url = 'https://bfhub.gg/meta/br';
            // Target ONLY "Absolute Meta" section.
            // BFHUB Structure: Sections usually have headers. We need the container under "Absolute Meta"
            // Selector: .meta-category:first-of-type (assuming Absolute is top) or specific ID
            selector = 'text:Absolute Meta';
            title = "BF6 REDSEC META (BFHUB)";
        } else {
            // Warzone Request -> WZHUB (User Requested Revert)
            if (mode === 'Battle Royale') {
                url = 'https://wzhub.gg/loadouts';
            } else {
                url = 'https://wzhub.gg/loadouts';
            }
            // WZHUB: Absolute Meta is usually the first list/category
            // We want to avoid capturing the whole page.
            // Let's rely on finding the "Absolute Meta" header's parent or the first loadout set.
            // If user asked for specific Tier (Meta), use Exact Match to avoid "Absolute Meta".
            if (args.tier === 'Meta') {
                selector = 'text_exact:Meta';
                title = "WARZONE META (Tier 2)";
            } else {
                selector = 'text:Absolute Meta';
                title = "WARZONE ABSOLUTE META";
            }
        }

        log(`📸 [MetaScraper] Screenshotting ${url} (Selector: ${selector})...`);

        let imageBuffer;
        let finalCaption = `🔫 **${title}**\nSource: ${url.split('/')[2]}`;

        if (args.weapon) {
            log(`🎯 [MetaScraper] Hunting for specific loadout: ${args.weapon}`);
            const result = await browser.getDetailedScreenshot(url, args.weapon);

            if (!result || !result.buffer) {
                return `❌ Could not find a loadout for **${args.weapon}** on ${url.split('/')[2]}.\nTry checking the specific weapon name.`;
            }
            imageBuffer = result.buffer;

            finalCaption = `🔫 **${args.weapon.toUpperCase()} Loadout**\n${title}`;
            if (result.buildCode) {
                finalCaption += `\n\n📋 **Build Code:**\n\`${result.buildCode}\``;
            }
        } else {
            imageBuffer = await browser.getScreenshot(url, selector);
        }

        if (!imageBuffer) {
            return "❌ Failed to capture meta screenshot. Check site status.";
        }

        // Send Image if Socket Available
        const { getWhatsAppSock } = require('../../../whatsapp/index');
        const sock = getWhatsAppSock();

        if (sock && chatId) {
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: finalCaption
            });
            return "[RESPONSE_SENT] Sent Meta Screenshot.";
        }

        // Fallback for testing (Return buffer as success signal if no chat)
        return `[SUCCESS] Image Captured (${imageBuffer.length} bytes)`;

    } catch (e) {
        log(`❌ [MetaScraper] Error: ${e.message}`);
        return "Failed to fetch meta loadouts.";
    }
}

module.exports = { definition, execute };
