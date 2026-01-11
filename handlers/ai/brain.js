// 📁 handlers/ai/brain.js
const { OpenAI } = require('openai');
const config = require('./config');
const contextManager = require('./context');
const memoryManager = require('./memory');
const toolsManager = require('./tools/index');
const learningEngine = require('./learning'); // ✅ שימוש בקוד הקיים שלך
const { log } = require('../../utils/logger');
const db = require('../../utils/firebase');
const admin = require('firebase-admin');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class ShimonBrain {

    async ask(userId, platform, userQuery, isAdmin = false) {
        try {
            // 1. שליפת היסטוריה
            const history = memoryManager.getHistory(platform, userId);

            // 2. בניית פרופיל חכם (זומבי/כסף)
            const techContext = await contextManager.buildContext(userId, platform);
            
            // 3. שליפת עובדות אישיות (מהקובץ הקיים שלך!)
            const factsContext = await learningEngine.getUserProfile(userId, platform);

            // 4. הרכבת הפרומפט
            const messages = [
                { 
                    role: "system", 
                    content: `${config.SYSTEM_PROMPT}\n\n${techContext}\n\n${factsContext}` 
                },
                ...history,
                { role: "user", content: userQuery }
            ];

            if (isAdmin) messages[0].content += "\n[ADMIN USER DETECTED - Respect Level: 100]";

            // 5. ריצה מול OpenAI
            const runner = await openai.chat.completions.create({
                model: config.MODEL,
                messages: messages,
                tools: toolsManager.definitions,
                tool_choice: "auto",
                temperature: config.TEMPERATURE,
                max_tokens: config.MAX_TOKENS
            });

            const msg = runner.choices[0].message;
            let finalResponse = "";

            // 6. טיפול בכלים (אם ה-AI החליט להפעיל)
            if (msg.tool_calls) {
                messages.push(msg); // מוסיפים את הבקשה להיסטוריה

                for (const toolCall of msg.tool_calls) {
                    log(`🛠️ [Brain] Executing tool: ${toolCall.function.name}`);
                    
                    const result = await toolsManager.execute(
                        toolCall.function.name,
                        JSON.parse(toolCall.function.arguments),
                        userId
                    );

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: String(result)
                    });
                }

                // ריצה שניה לקבלת התשובה הסופית
                const secondRun = await openai.chat.completions.create({
                    model: config.MODEL,
                    messages: messages
                });
                finalResponse = secondRun.choices[0].message.content;
            } else {
                finalResponse = msg.content;
            }

            // 7. סיום: שמירה בזיכרון, למידה, וסטטיסטיקה
            memoryManager.addMessage(platform, userId, "user", userQuery);
            memoryManager.addMessage(platform, userId, "assistant", finalResponse);
            
            // שימוש בקוד הקיים שלך ללמידת עובדות חדשות
            learningEngine.learnFromContext(userId, "User", platform, userQuery);
            
            this.trackStats(userId, finalResponse.length);

            return finalResponse;

        } catch (error) {
            log(`❌ [Brain] Fatal Error: ${error.message}`);
            return "וואלה נשרף לי ה-CPU. תן לי רגע להתאפס.";
        }
    }

    async trackStats(userId, chars) {
        if (!userId) return;
        try {
            await db.collection('users').doc(userId.toString()).set({
                stats: { aiCharsUsed: admin.firestore.FieldValue.increment(chars) },
                meta: { lastActive: new Date().toISOString() }
            }, { merge: true });
        } catch(e) {}
    }
}

module.exports = new ShimonBrain();