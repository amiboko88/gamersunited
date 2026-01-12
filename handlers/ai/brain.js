// 📁 handlers/ai/brain.js
const { OpenAI } = require('openai');
const config = require('./config');
const contextManager = require('./context');
const memoryManager = require('./memory');
const toolsManager = require('./tools/index');
const learningEngine = require('./learning'); 
const { log } = require('../../utils/logger');
const db = require('../../utils/firebase');
const admin = require('firebase-admin');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class ShimonBrain {

    // ✅ הוספתי פרמטר imageBuffer
    async ask(userId, platform, userQuery, isAdmin = false, imageBuffer = null) {
        try {
            // 1. הקשרים והיסטוריה
            const history = memoryManager.getHistory(platform, userId);
            const techContext = await contextManager.buildContext(userId, platform);
            const factsContext = await learningEngine.getUserProfile(userId, platform);

            // 2. בניית הודעת המשתמש (טקסט + תמונה אם יש)
            let userContent = [];
            if (userQuery) userContent.push({ type: "text", text: userQuery });
            
            if (imageBuffer) {
                const base64Image = imageBuffer.toString('base64');
                userContent.push({
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                });
                log(`[Brain] 👁️ תמונה צורפה לבקשה של ${userId}`);
            }

            // 3. הרכבת רשימת ההודעות
            const messages = [
                { 
                    role: "system", 
                    content: `${config.SYSTEM_PROMPT}\n\n${techContext}\n\n${factsContext}` 
                },
                ...history,
                { role: "user", content: userContent }
            ];

            if (isAdmin) messages[0].content += "\n[ADMIN USER DETECTED - Respect Level: 100]";

            // 4. שליחה ל-OpenAI
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

            // 5. ביצוע כלים (Tools Execution)
            if (msg.tool_calls) {
                // חייבים להוסיף את הודעת ה-Assistant המקורית להיסטוריה של הריצה הנוכחית
                messages.push(msg); 

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

                // ריצה שניה לקבלת התשובה הסופית (ה-AI מסכם את מה שהכלים עשו)
                const secondRun = await openai.chat.completions.create({
                    model: config.MODEL,
                    messages: messages
                });
                finalResponse = secondRun.choices[0].message.content;
            } else {
                finalResponse = msg.content;
            }

            // 6. שמירה וסטטיסטיקה
            // בזיכרון נשמור רק את הטקסט (חוסך מקום)
            memoryManager.addMessage(platform, userId, "user", userQuery || "[Image Uploaded]");
            memoryManager.addMessage(platform, userId, "assistant", finalResponse);
            
            learningEngine.learnFromContext(userId, "User", platform, userQuery);
            this.trackStats(userId, finalResponse?.length || 0);

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