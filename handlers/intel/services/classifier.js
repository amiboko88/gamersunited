const { OpenAI } = require('openai');
const { log } = require('../../../utils/logger'); // Adjust path as needed

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class IntelClassifier {
    /**
     * Classifies user text into a structured Intent.
     * @param {string} text - The raw user query.
     * @returns {Promise<{intent: string, entity: string|null, game: string|null, confidence: number}>}
     */
    async classify(text) {
        try {
            const prompt = `
            Task: Analyze the following Gamer Query and extract User Intent.
            User Query: "${text}"
            
            Context: You are the routing engine for a Gaming Bot (Call of Duty, Battlefield 6, Nvidia, FIFA/FC26).
            
            Available Intents:
            1. WEAPON_META (Asking for build, loadout, class, best weapon, "is X good?")
            2. GAME_UPDATE (Patch notes, news, what changed, "update for X")
            3. DRIVER_UPDATE (Nvidia/GPU drivers)
            4. PLAYLIST_INFO (What modes are live, map rotation)
            5. SERVER_STATUS (Is game down? Lagging?)
            6. GENERAL_CHAT (Hello, who are you, insults, jokes - irrelevant to Intelligence)

            Output JSON Format ONLY:
            {
                "intent": "INTENT_NAME",
                "entity": "Extracted specific item (e.g., 'ISO Hemlock', 'Nvidia', 'Rebirth')",
                "game": "COD" | "BF6" | "FC26" | "GENERAL" | null,
                "confidence": 0.0-1.0
            }
            
            Rules:
            1. If asking for specific weapon (e.g., "Build for MP5"), entity="MP5", game="COD" (default) or "BF6".
            2. If "Nvidia" or "Drivers", intent="DRIVER_UPDATE".
               - "בתאל", "באטל", "בטלפילד" -> game="BF6"
               - "קוד", "וורזון", "warzone" -> game="COD"
               - "פיפא", "fifa", "fc26", "fc" -> game="FC26"
               - "מטה", "מטא" -> intent="WEAPON_META"
            `;

            const runner = await openai.chat.completions.create({
                model: "gpt-4o-mini", // Fast & Cheap
                messages: [{ role: "system", content: prompt }],
                temperature: 0,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(runner.choices[0].message.content);
            log(`🧠 [Classifier] Classified: "${text}" -> [${result.intent}] Entity: ${result.entity}`);
            return result;

        } catch (e) {
            log(`❌ [Classifier] Error: ${e.message}`);
            // Fallback to General Chat if AI fails
            return { intent: "GENERAL_CHAT", entity: null, game: null, confidence: 0 };
        }
    }
}

module.exports = new IntelClassifier();
