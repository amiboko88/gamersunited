// 📁 handlers/ai/brain.js
const OpenAI = require('openai');
const config = require('./config');
const contextManager = require('./context');
const learningEngine = require('./learning'); 
const { log } = require('../../utils/logger');
const db = require('../../utils/firebase');
const admin = require('firebase-admin');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class ShimonBrain {
    
    async ask(userId, platform, question, isAdmin = false) {
        try {
            // 1. הקשר טכני
            const techContext = await contextManager.buildContext(userId, platform, question);
            // 2. הקשר אישי
            const personalContext = await learningEngine.getUserProfile(userId, platform);

            // 3. הרכבת הפרומפט
            let finalSystemPrompt = config.SYSTEM_PROMPT;
            finalSystemPrompt += `\n\n${techContext}`;
            finalSystemPrompt += `\n${personalContext}`;
            
            if (isAdmin) finalSystemPrompt += "\n⚠️ המשתמש הוא מנהל.";
            if (question.includes("ספאם")) finalSystemPrompt += "\n⚠️ המשתמש מציף, רד עליו.";

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

            // ✅ התיקון הבטוח: שימוש ב-set עם merge
            // זה מבטיח שהנתונים ייכנסו בדיוק לתיקיות הנכונות (stats/meta) ולא יעשו בלאגן
            if (answer && userId) {
                const charsUsed = answer.length;
                const userRef = db.collection('users').doc(userId.toString());
                
                // אנחנו שולחים רק את השדות שצריך לעדכן, ה-merge דואג לשמור על כל השאר
                userRef.set({
                    stats: { aiCharsUsed: admin.firestore.FieldValue.increment(charsUsed) },
                    meta: { lastActive: new Date().toISOString() }
                }, { merge: true }).catch(err => {
                    console.error(`[Brain] Stats Error: ${err.message}`);
                });
            }

            return answer || "נתקע לי המוח.";

        } catch (error) {
            log(`❌ [Brain] Error: ${error.message}`);
            return "תקלה במוח. דבר איתי אח\"כ.";
        }
    }
}

module.exports = new ShimonBrain();