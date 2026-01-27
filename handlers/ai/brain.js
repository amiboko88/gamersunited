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

    async ask(userId, platform, userQuery, isAdmin = false, imageBuffers = null, chatId = null, skipPersistence = false) {
        try {
            // 1. הקשרים והיסטוריה
            const history = memoryManager.getHistory(platform, userId);
            const techContext = await contextManager.buildContext(userId, platform);
            const factsContext = await learningEngine.getUserProfile(userId, platform);

            // 2. בניית הודעת המשתמש
            let userContent = [];
            if (userQuery) userContent.push({ type: "text", text: userQuery });

            if (imageBuffers) {
                // If single buffer passed by mistake, wrap it
                const buffers = Array.isArray(imageBuffers) ? imageBuffers : [imageBuffers];

                for (const buf of buffers) {
                    if (!buf) continue;
                    const base64Image = buf.toString('base64');
                    userContent.push({
                        type: "image_url",
                        image_url: { url: `data:image/jpeg;base64,${base64Image}` }
                    });
                }
            }

            // 3. הרכבת הפרומפט
            let dynamicSystemPrompt = config.SYSTEM_PROMPT;

            // 🕵️ SPY MODE (Live Monitoring for Admin)
            if (platform === 'discord' && !chatId) {
                log(`🕵️ [SpyMode] User ${userId} says: "${userQuery}"`);
            }
            if (platform === 'whatsapp' && chatId && !chatId.endsWith('@g.us')) {
                log(`🕵️ [SpyMode] WA User ${userId} says: "${userQuery}"`);
            }

            // הזרקת הקשר זמן
            dynamicSystemPrompt += `\n# 📅 Context\nCurrent Time: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}\n`;

            // 👑 הזרקת פרוטוקול MVP 👑
            try {
                const mvpDoc = await db.collection('system_metadata').doc('current_mvp').get();
                if (mvpDoc.exists) {
                    const mvp = mvpDoc.data();
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

                    const result = await toolsManager.execute(
                        toolCall.function.name,
                        JSON.parse(toolCall.function.arguments),
                        userId,
                        chatId,
                        imageBuffers // ✅ Passing ARRAY now
                    );

                    // 🛑 SILENT SIGNAL: If tool handled the response completely
                    if (String(result).includes('[RESPONSE_SENT]')) {
                        log(`🤫 [Brain] Tool handled response. Silence mode activated.`);
                        return ""; // Exit immediately, no text reply
                    }

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
            if (!skipPersistence) {
                memoryManager.addMessage(platform, userId, "user", userQuery || "[Media]");
                memoryManager.addMessage(platform, userId, "assistant", finalResponse);

                learningEngine.learnFromContext(userId, "User", platform, userQuery);
                this.trackStats(userId, finalResponse?.length || 0);
            }

            // 🕵️ SPY MODE - תשובות
            if ((platform === 'discord' && !chatId) || (platform === 'whatsapp' && chatId && !chatId.endsWith('@g.us'))) {
                log(`🕵️ [SpyMode] Shimon replied to ${userId}: "${finalResponse}"`);
            }

            return finalResponse;

        } catch (error) {
            log(`❌ [Brain] Fatal Error: ${error.message}`);
            return "נשרף לי הפיוז. דבר איתי עוד דקה.";
        }
    }

    async shouldReply(userId, text) {
        try {
            const prompt = `
            You are "Shimon", an elite gamer bot with a toxic but helpful personality. 
            Analyze the following message from a user in a group chat.
            
            Message: "${text}"
            
            Task: Your goal is to be a SILENT OBSERVER unless explicitly needed.
            
            Criteria for YES (Intervene):
            1. The user mentions "Shimon", "Bot", "Admin", or "Manager".
            2. The user asks a DIRECT question to the group that no one is answering (e.g., "Does anyone know if servers are down?").
            3. The user is spreading MISINFORMATION about Gaming/Tech (You must correct them).
            
            Criteria for NO (Silence):
            1. Users talking to EACH OTHER (e.g., "Yogi did you see that?", "Yeah bro").
            2. Reactions to links/news posted by others (e.g., "Wow crazy", "Damn").
            3. Casual chatter, laughs, jokes, political/news discussions not related to gaming.
            4. If you are unsure -> NO.
            
            Reply ONLY with "YES" or "NO".
            `;

            const runner = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0,
                max_tokens: 5
            });

            const decision = runner.choices[0].message.content.trim().toUpperCase();
            return decision.includes("YES");

        } catch (error) {
            return false;
        }
    }

    async trackStats(userId, chars) {
        if (!userId) return;

        // 🛡️ BLOCK GHOST DOCS:
        // Do not write stats for unlinked phone numbers (Length < 16).
        // Only write for Discord/Linked IDs (Snowflake is ~18 chars).
        if (userId.toString().length < 16) return;

        try {
            await db.collection('users').doc(userId.toString()).set({
                stats: { aiCharsUsed: admin.firestore.FieldValue.increment(chars) },
                meta: { lastActive: new Date().toISOString() }
            }, { merge: true });
        } catch (e) { }
    }

    async generateInternal(prompt) {
        try {
            const runner = await openai.chat.completions.create({
                model: config.MODEL,
                messages: [{ role: "system", content: prompt }],
                temperature: 0.7
            });
            return runner.choices[0].message.content;
        } catch (error) {
            log(`❌ [Brain] Internal Gen Error: ${error.message}`);
            return null;
        }
    }

    async executeKillSwitch(targetUserId, platform) {
        try {
            log(`☠️ [Brain] KILL SWITCH ACTIVATED against ${targetUserId}`);

            const factsContext = await learningEngine.getUserProfile(targetUserId, platform);

            const killPrompt = `
            You are Shimon, the ruthless enforcer.
            The MVP (The King) has ordered you to DESTROY this user: ${targetUserId}.
            
            TARGET INTEL (USE THIS TO HURT THEM):
            ${factsContext}
            
            MISSION:
            Generate a short, brutal, funny ROAST based on the facts above.
            If they play bad games? Mock them.
            
            FORMAT:
            - Language: Hebrew (Slang, Aggressive).
            - Output: RAW TEXT only.
            `;

            const runner = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: killPrompt }],
                temperature: 1.0
            });

            const roastText = runner.choices[0].message.content;

            const voiceHandler = require('./voice');
            const audioBuffer = await voiceHandler.speak(roastText);

            return audioBuffer;

        } catch (error) {
            log(`❌ [KillSwitch] Failed: ${error.message}`);
            return null;
        }
    }
}

module.exports = new ShimonBrain();