const browserAdapter = require('../adapters/browser');
const brain = require('../../ai/brain');
const { log } = require('../../../utils/logger');

class IntelEnricher {
    async enrich(item, userQuery = "") {
        // Only enrich relevant patch notes
        // Relaxed Check: Match Call of Duty links OR titles with Update/Notes
        if (!item.link) return item;

        const isTarget = item.link.includes('callofduty') ||
            item.link.includes('nvidia') ||
            item.link.includes('ea.com') ||
            item.title.includes('Notes') ||
            item.title.includes('Update');

        if (!isTarget) return item;

        try {
            const articleText = await browserAdapter.getArticleContent(item.link);
            if (articleText && articleText.length > 100) {

                // Dynamic Prompt System
                let systemPrompt = "";

                // Check if query is specific (not just "update" or "new")
                const genericKeywords = ['update', 'news', 'new', 'patch', 'notes', 'עדכון', 'חדש', 'חדשות', 'מה'];
                const specificQuery = userQuery.split(' ').filter(w => !genericKeywords.includes(w) && w.length > 2).length > 0;

                if (specificQuery && userQuery.length > 5) {
                    // Contextual Q&A Mode
                    systemPrompt = `
                    Task: You are Shimon, a helpful gamer bot. 
                    User asked: "${userQuery}" regarding the latest Patch Notes.
                    
                    Instructions:
                    1. Search the text below for the answer.
                    2. Answer in Hebrew Slang (Shimon Persona).
                    3. If found, explain exactly what changed.
                    4. If NOT found, say "Didn't see anything about that in the notes, bro."
                    5. Keep it short (under 100 words).
                    
                    Patch Notes Content:
                    "${articleText.slice(0, 5000)}"
                    `;
                } else {
                    // Default Summary Mode (Interactive Strategy)
                    const isLongText = articleText.length > 6000;

                    systemPrompt = `
                    Task: Translate and summarize these Game Patch Notes into cool, slang-heavy Hebrew for gamers.
                    
                    Tone: Excited, "Bro", Informative (Shimon Persona).
                    Rules:
                    1. Start with "🚨 עדכון חדש! 🚨".
                    2. Bullet points for key changes (Nerfs/Buffs/New Modes).
                    3. Keep it under 150 words.
                    4. Use emojis.
                    ${isLongText ? `5. HUGE UPDATE DETECTED: Summarize ONLY the Top 3 biggest changes. End with: "יש פה עוד ים דברים (שינויי מפה, נשקים). תהיה ספציפי מה אתה מחפש!"` : ''}
                    
                    Content:
                    "${articleText.slice(0, 4000)}"
                    `;
                }

                const aiSummary = await brain.generateInternal(systemPrompt);

                if (aiSummary) {
                    // Return enhanced object
                    return { ...item, summary: aiSummary, aiSummary: aiSummary };
                }
            }
        } catch (e) {
            log(`⚠️ [Intel] AI Enrichment failed: ${e.message}`);
        }
        // If enrichment failed or no text, return original item
        return item;
    }
}

module.exports = new IntelEnricher();
