// 📁 handlers/ai/brain.js
const OpenAI = require('openai');
const config = require('./config');
const contextManager = require('./context');
const learningEngine = require('./learning'); // ✅ החיבור למנוע הלמידה
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class ShimonBrain {
    
    /**
     * הפונקציה הראשית לשאילתת AI
     * @param {string} userId - מזהה המשתמש
     * @param {string} platform - פלטפורמה
     * @param {string} question - הטקסט/השאלה
     * @param {boolean} isAdmin - האם המשתמש הוא אדמין
     */
    async ask(userId, platform, question, isAdmin = false) {
        try {
            // 1. בניית הקשר טכני (כסף, רמה, גיל)
            const techContext = await contextManager.buildContext(userId, platform, question);
            
            // 2. בניית הקשר אישי ("הספר השחור" - עובדות וירידות)
            const personalContext = await learningEngine.getUserProfile(userId, platform);

            // 3. הרכבת הפרומפט הסופי
            let finalSystemPrompt = config.SYSTEM_PROMPT;
            finalSystemPrompt += `\n\n${techContext}`;
            finalSystemPrompt += `\n${personalContext}`;
            
            // הוראות מיוחדות לאדמין
            if (isAdmin) {
                finalSystemPrompt += "\n⚠️ הערה: המשתמש הזה הוא מנהל (Admin). תן לו כבוד, אבל אל תצא דמות.";
            }

            // הוראות מיוחדות לספאם או ירידות (אם זוהה בטקסט)
            if (question.includes("ספאם") || question.includes("מציף")) {
                finalSystemPrompt += "\n⚠️ המשתמש מציף את הצ'אט. תרד עליו חזק שירגע.";
            }

            // 4. שליחה ל-OpenAI
            const response = await openai.chat.completions.create({
                model: config.MODEL, // gpt-4o
                messages: [
                    { role: "system", content: finalSystemPrompt },
                    { role: "user", content: question }
                ],
                temperature: config.TEMPERATURE,
                max_tokens: config.MAX_TOKENS,
                presence_penalty: 0.3, // למנוע חזרתיות
                frequency_penalty: 0.3
            });

            const answer = response.choices[0]?.message?.content?.trim();
            
            // לוג לניטור
            // log(`🤖 [Brain] Q: "${question}" | A: "${answer.substring(0, 20)}..."`);
            
            return answer || "וואלה נתקע לי המוח. נסה שוב רגע.";

        } catch (error) {
            log(`❌ [Brain] שגיאה קריטית: ${error.message}`);
            return "נתקלתי בבאג רציני בשרתים. דבר איתי אח\"כ.";
        }
    }
}

module.exports = new ShimonBrain();