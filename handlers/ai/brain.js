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

    // ✅ הוספנו chatId כדי לדעת לאן להחזיר תשובה/מדיה
    async ask(userId, platform, userQuery, isAdmin = false, imageBuffer = null, chatId = null) {
        try {
            // 1. הקשרים והיסטוריה
            const history = memoryManager.getHistory(platform, userId);
            const techContext = await contextManager.buildContext(userId, platform);
            const factsContext = await learningEngine.getUserProfile(userId, platform);

            // 2. בניית הודעת המשתמש
            let userContent = [];
            if (userQuery) userContent.push({ type: "text", text: userQuery });

            if (imageBuffer) {
                const base64Image = imageBuffer.toString('base64');
                userContent.push({
                    type: "image_url",
                    image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                });
            }

            // 3. הרכבת הפרומפט
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

            // 5. ביצוע כלים
            if (msg.tool_calls) {
                messages.push(msg);

                for (const toolCall of msg.tool_calls) {
                    log(`🛠️ [Brain] Executing tool: ${toolCall.function.name}`);

                    // ✅ מעבירים את ה-chatId לכלי כדי שידע לאן לשלוח מדיה
                    const result = await toolsManager.execute(
                        toolCall.function.name,
                        JSON.parse(toolCall.function.arguments),
                        userId,
                        chatId
                    );

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: String(result)
                    });
                }

                const secondRun = await openai.chat.completions.create({
                    model: config.MODEL,
                    messages: messages
                });
                finalResponse = secondRun.choices[0].message.content;
            } else {
                finalResponse = msg.content;
            }

            // 6. שמירה
            memoryManager.addMessage(platform, userId, "user", userQuery || "[Media]");
            memoryManager.addMessage(platform, userId, "assistant", finalResponse);

            learningEngine.learnFromContext(userId, "User", platform, userQuery);
            this.trackStats(userId, finalResponse?.length || 0);

            return finalResponse;

        } catch (error) {
            log(`❌ [Brain] Fatal Error: ${error.message}`);
            return "נשרף לי הפיוז. דבר איתי עוד דקה.";
        }
    }

    /**
     * ✅ מוח "שיפוט" - מחליט אם להתערב בשיחה שלא כוונה אליו ישירות
     */
    async shouldReply(userId, text) {
        try {
            const prompt = `
            You are "Shimon", an elite gamer bot with a toxic but helpful personality. 
            Analyze the following message from a user in a group chat.
            
            Message: "${text}"
            
            Task: Decide if you should intervene and reply voluntarily.
            
            Criteria for YES:
            1. The user is asking a general question (e.g., "Why is the internet slow?", "What game should I play?").
            2. The user is incorrect about a gaming fact (you need to correct them).
            3. The user sounds desperate for help with technology.
            4. The message fits your specific knowledge base (Gaming, Discord, Servers, Tech).

            Criteria for NO:
            1. Casual conversation (e.g., "Good morning", "How are you?").
            2. Message directed at a specific person (e.g., "@Danny come here").
            3. Short/Meaningless text (e.g., "lol", "k").
            
            Reply ONLY with "YES" or "NO".
            `;

            const runner = await openai.chat.completions.create({
                model: "gpt-3.5-turbo", // מודל מהיר וזול לשיפוט
                messages: [{ role: "user", content: prompt }],
                temperature: 0,
                max_tokens: 5
            });

            const decision = runner.choices[0].message.content.trim().toUpperCase();
            return decision.includes("YES");

        } catch (error) {
            return false; // במקרה של שגיאה, עדיף לשתוק
        }
    }

    async trackStats(userId, chars) {
        if (!userId) return;
        try {
            await db.collection('users').doc(userId.toString()).set({
                stats: { aiCharsUsed: admin.firestore.FieldValue.increment(chars) },
                meta: { lastActive: new Date().toISOString() }
            }, { merge: true });
        } catch (e) { }
    }
}

module.exports = new ShimonBrain();