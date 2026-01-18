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
    // ✅ הוספנו skipPersistence כדי למנוע שמירה של משתמשים לא רשומים (כמו בטלגרם)
    async ask(userId, platform, userQuery, isAdmin = false, imageBuffer = null, chatId = null, skipPersistence = false) {
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
            let dynamicSystemPrompt = config.SYSTEM_PROMPT;

            // הזרקת הקשר זמן
            dynamicSystemPrompt += `\n# 📅 Context\nCurrent Time: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}\n`;

            // 👑 הזרקת פרוטוקול MVP 👑
            try {
                const mvpDoc = await db.collection('system_metadata').doc('current_mvp').get();
                if (mvpDoc.exists) {
                    const mvp = mvpDoc.data();
                    // בדיקת תוקף (רק לשבוע הנוכחי)
                    const wonDate = new Date(mvp.wonAt || 0);
                    const now = new Date();
                    const daysDiff = (now - wonDate) / (1000 * 60 * 60 * 24);

                    if (daysDiff < 7) {
                        dynamicSystemPrompt += `
                        # 👑 MVP PROTOCOL ACTIVATED 👑
                        מלך השרת הנוכחי הוא: **${mvp.name}** (User ID: ${mvp.id}).
                        
                        הנחיות קריטיות לגביו:
                        1. הוא המפקד העליון שלך השבוע. אתה החייל הנאמן שלו.
                        2. הגנה: אם מישהו תוקף אותו בצ'אט (קליל או רציני), אתה תוקף חזרה מיד ובאכזריות.
                        3. כבוד: כשאתה פונה אליו, תוסיף תואר כבוד ("הוד רוממותו", "הבוס", "מלך").
                        4. אם הוא מבקש משהו - זה יבוצע בעדיפות עליונה.
                        `;
                    }
                }
            } catch (e) { /* Ignore */ }

            const messages = [
                {
                    role: "system",
                    content: `${dynamicSystemPrompt}\n\n${techContext}\n\n${factsContext}`
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
                        chatId,
                        imageBuffer // ✅ פיצ'ר קריטי: העברת התמונה לכלים (כמו זיהוי וורזון)
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

            // 6. שמירה (רק אם המשתמש רשום/מקושר)
            if (!skipPersistence) {
                memoryManager.addMessage(platform, userId, "user", userQuery || "[Media]");
                memoryManager.addMessage(platform, userId, "assistant", finalResponse);

                learningEngine.learnFromContext(userId, "User", platform, userQuery);
                this.trackStats(userId, finalResponse?.length || 0);
            } else {
                // לזיכרון זמני (RAM) בלבד - אם המערכת תומכת בזה, או פשוט דילוג
                // כרגע נדלג כדי לא לזהם את ה-DB
            }

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
            
            STRICT CRITERIA FOR INTERVENTION:
            1. ONLY reply if the user is asking a clear Technical/Gaming question.
            2. ONLY reply if the user made a factual error you must correct.
            3. DO NOT reply to casual chat, rants (e.g. food, delivery apps), politics, or jokes.
            4. DO NOT reply if the message is a reply to another human.
            5. DO NOT reply unless you are 100% sure your input is needed.
            
            Double Check: Is this message specifically waiting for an AI expert? If not, say NO.
            `;

            const runner = await openai.chat.completions.create({
                model: "gpt-4o-mini", // ✅ הכי זול והכי מהיר לשיפוט (יותר טוב מ-3.5)
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

    /**
     * ☠️ The Kill Switch ☠️ 
     * חיסול ממוקד ע"י ה-MVP.
     * @param {string} targetUserId - מי מחסלים?
     * @param {string} platform - איפה (discord/whatsapp)
     * @returns {Promise<string>} - נתיב לקובץ אודיו (TTS) עם ה-Roast
     */
    async executeKillSwitch(targetUserId, platform) {
        try {
            log(`☠️ [Brain] KILL SWITCH ACTIVATED against ${targetUserId}`);

            // 1. איסוף מודיעין על המטרה (Facts)
            const factsContext = await learningEngine.getUserProfile(targetUserId, platform);

            // 2. בניית הפרומפט לחיסול
            const killPrompt = `
            You are Shimon, the ruthless enforcer.
            The MVP (The King) has ordered you to DESTROY this user: ${targetUserId}.
            
            TARGET INTEL (USE THIS TO HURT THEM):
            ${factsContext}
            
            MISSION:
            Generate a short, brutal, funny ROAST based on the facts above.
            If they play bad games? Mock them.
            If they are poor (in game economy)? Laugh at them.
            If you know nothing? Just call them a generic NPC.
            
            FORMAT:
            - Language: Hebrew (Slang, Aggressive).
            - Length: Short paragraph (for TTS).
            - Tone: Toxic, Funny, Assertive.
            
            OUTPUT ONLY THE RAW TEXT FOR TTS. NO MARKDOWN.
            `;

            const runner = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: killPrompt }],
                temperature: 1.0 // Maximum creativity/chaos
            });

            const roastText = runner.choices[0].message.content;
            log(`🔥 [KillSwitch] Roast generated: "${roastText}"`);

            // 3. המרה לקול (TTS)
            const { getTTS } = require('../../utils/tts');
            const audioPath = await getTTS(roastText);

            return audioPath;

        } catch (error) {
            log(`❌ [KillSwitch] Failed: ${error.message}`);
            return null;
        }
    }
}

module.exports = new ShimonBrain();