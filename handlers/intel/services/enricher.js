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
                const isCodPatchNotes = item.link.includes('callofduty.com') && (item.link.includes('patchnotes') || item.link.includes('patch-notes'));

                if (isCodPatchNotes) {
                    const systemPrompt = `
                    You are an Elite Call of Duty Analyst. 
                    INPUT: Raw text from the Official Patch Notes page.
                    TASK: Analyze the Update. If there are multiple updates, focus on the LATEST one (e.g. Look for latest date).
                    
                    CRITICAL RULES:
                    1. **WEAPONS**: 
                       - Output ONLY the English Weapon Name (e.g. "AK-27", "XM4").
                       - DO NOT include stats (e.g. "+1 damage").
                       - DO NOT include "[Buff]" text anymore (JSON structure handles it).
                       - ONLY include weapons with explicit Buffs or Nerfs. Ignore Neutrals.
                    
                    2. **BUG FIXES**: Look for "BUG FIXES" (often at the bottom). Extract real fixes.
                    
                    3. **FORMAT**: JSON ONLY.
                    {
                        "title": "UPDATE TITLE (e.g. THURSDAY JANUARY 22)",
                        "date": "dd.mm.yyyy",
                        "sections": [
                            { "title": "🛠️ BUG FIXES", "content": ["Fix 1 (Hebrew)", "Fix 2 (Hebrew)"], "type": "fixes" },
                            { "title": "🚀 WEAPON BUFFS", "content": ["AK-27", "XM4"], "type": "buffs" },
                            { "title": "🔻 WEAPON NERFS", "content": ["DS20 Mirage"], "type": "nerfs" }
                        ],
                        "summary": "Short Hebrew summary for caption"
                    }
                    
                    TRANSLATION: Content in Hebrew. Names in English.
                    `;

                    const aiJson = await brain.generateJSON(systemPrompt + `\n\nContent:\n${articleText.slice(0, 80000)}`);

                    if (aiJson) {
                        return {
                            ...item,
                            summary: aiJson.summary || "עדכון חדש למשחק! הנה מה שהשתנה:",
                            aiSummary: aiJson.summary,
                            sections: aiJson.sections,
                            title: aiJson.title || item.title
                        };
                    }
                }

                // Default Logic for Non-COD (or fallthrough)
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
                    Content:
                    "${articleText.slice(0, 5000)}"
                    `;
                    const aiSummary = await brain.generateInternal(systemPrompt);
                    if (aiSummary) return { ...item, summary: aiSummary, aiSummary: aiSummary };

                } else {
                    // Default Summary Mode
                    const isLongText = articleText.length > 6000;
                    systemPrompt = `
                    Task: Translate and summarize these Game Patch Notes into cool, slang-heavy Hebrew for gamers.
                    Tone: Excited, "Bro", Informative (Shimon Persona).
                    Rules:
                    1. Start with "🚨 עדכון חדש! 🚨".
                    2. Bullet points for key changes (Nerfs/Buffs/New Modes).
                    3. Keep it under 150 words.
                    4. Use emojis.
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
