// 📁 handlers/ai/brain.js
const OpenAI = require('openai');
const config = require('./config');
const contextManager = require('./context');
const learningEngine = require('./learning'); 
const { log } = require('../../utils/logger');

// ✅ [PLANT] חיבור ל-DB ול-Admin לצורך עדכון מונה תווים
const db = require('../../utils/firebase');
const admin = require('firebase-admin'); 

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class ShimonBrain {
    
    async ask(userId, platform, question, isAdmin = false) {
        try {
            // 1. בניית הקשר טכני
            const techContext = await contextManager.buildContext(userId, platform, question);
            
            // 2. בניית הקשר אישי
            const personalContext = await learningEngine.getUserProfile(userId, platform);

            // 3. הרכבת הפרומפט הסופי
            let finalSystemPrompt = config.SYSTEM_PROMPT;
            finalSystemPrompt += `\n\n${techContext}`;
            finalSystemPrompt += `\n${personalContext}`;
            
            if (isAdmin) {
                finalSystemPrompt += "\n⚠️ הערה: המשתמש הזה הוא מנהל (Admin). תן לו כבוד, אבל אל תצא דמות.";
            }

            if (question.includes("ספאם") || question.includes("מציף")) {
                finalSystemPrompt += "\n⚠️ המשתמש מציף את הצ'אט. תרד עליו חזק שירגע.";
            }

            // 4. שליחה ל-OpenAI
            const response = await openai.chat.completions.create({
                model: config.MODEL, 
                messages: [
                    { role: "system", content: finalSystemPrompt },
                    { role: "user", content: question }
                ],
                temperature: config.TEMPERATURE,
                max_tokens: config.MAX_TOKENS,
                presence_penalty: 0.3,
                frequency_penalty: 0.3
            });

            const answer = response.choices[0]?.message?.content?.trim();
            
            // ✅ [PLANT] מנגנון ספירת תווים (מונה שימוש)
            // אנחנו מבצעים את זה במקביל (בלי await) כדי לא לעכב את התשובה למשתמש
            if (answer && userId) {
                const charsUsed = answer.length;
                db.collection('users').doc(userId).update({
                    'stats.aiCharsUsed': admin.firestore.FieldValue.increment(charsUsed)
                }).catch(err => {
                    // לוג שקט במקרה של כשלון בעדכון סטטיסטיקה (לא קריטי למשתמש)
                    console.error(`[Brain] Failed to update stats for ${userId}: ${err.message}`);
                });
            }
            // ✅ [END PLANT]

            return answer || "וואלה נתקע לי המוח. נסה שוב רגע.";

        } catch (error) {
            log(`❌ [Brain] שגיאה קריטית: ${error.message}`);
            return "נתקלתי בבאג רציני בשרתים. דבר איתי אח\"כ.";
        }
    }
}

module.exports = new ShimonBrain();