// 📁 handlers/ai/learning.js
const { OpenAI } = require('openai');
const admin = require('firebase-admin');
const { getUserRef } = require('../../utils/userUtils');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class LearningEngine {
    
    /**
     * הצופה השקט: מנתח הודעות ברקע ושומר עובדות
     * @param {string} userId - מזהה המשתמש
     * @param {string} userName - שם המשתמש
     * @param {string} platform - הפלטפורמה (whatsapp/discord)
     * @param {string} text - תוכן ההודעה
     */
    async learnFromContext(userId, userName, platform, text) {
        // סינון ראשוני: הודעות קצרות מדי, ספאם, או פקודות בוט לא רלוונטיות ללמידה
        if (!text || text.length < 15 || text.startsWith('/') || text.includes('חחח')) {
            return;
        }

        try {
            // 1. ניתוח באמצעות AI קטן ומהיר לחילוץ עובדות
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini", // מודל מהיר וזול
                messages: [
                    { 
                        role: "system", 
                        content: `You are a fact extractor. 
                        Task: Extract new facts about the user "${userName}" from the text.
                        Rules:
                        1. Ignore opinions, questions, or random chatter.
                        2. Look for: Events, Purchases, location changes, personal status.
                        3. Output format: The fact in Hebrew.
                        4. If no fact found, return "FALSE".
                        
                        Example: "אני טס מחר ליוון" -> "טס ליוון מחר".
                        Example: "איזה משחק גרוע" -> "FALSE".` 
                    },
                    { role: "user", content: text }
                ],
                max_tokens: 60,
                temperature: 0 // דיוק מקסימלי
            });

            const fact = completion.choices[0]?.message?.content?.trim();

            // 2. שמירה ב-DB (רק אם נמצאה עובדה אמיתית)
            if (fact && fact !== "FALSE" && !fact.includes("FALSE")) {
                const userRef = await getUserRef(userId, platform);
                
                // שימוש ב-arrayUnion כדי להוסיף לרשימה בלי למחוק קודמים
                await userRef.update({
                    'brain.facts': admin.firestore.FieldValue.arrayUnion({
                        content: fact,
                        date: new Date().toISOString(),
                        source: 'chat_learning_v2',
                        originalText: text // שומרים גם את ההקשר המקורי
                    })
                });
                
                log(`🧠 [Learning] למדתי עובדה חדשה על ${userName}: "${fact}"`);
            }

        } catch (error) {
            // לוג שגיאה שקט כדי לא להציף את הקונסול
            console.warn(`⚠️ [Learning] נכשל בניתוח הודעה מ-${userName}: ${error.message}`);
        }
    }

    /**
     * שליפת הפרופיל המלא של המשתמש (עובדות + ירידות) לשימוש ב-Brain
     */
    async getUserProfile(userId, platform) {
        try {
            const userRef = await getUserRef(userId, platform);
            const doc = await userRef.get();
            
            if (!doc.exists) return "";

            const data = doc.data();
            let profileContext = "";

            // 1. שליפת עובדות (Facts)
            const facts = data.brain?.facts || [];
            if (facts.length > 0) {
                // לוקחים את 5 העובדות האחרונות (הכי רלוונטיות)
                // וממיינים לפי תאריך אם צריך, כאן אנחנו לוקחים את סוף המערך
                const recentFacts = facts.slice(-5).map(f => `- ${f.content}`).join('\n');
                profileContext += `\n# דברים שאני יודע עליו (מהעבר):\n${recentFacts}\n`;
            }

            // 2. שליפת ירידות שמורות (Roasts) - לשימוש ב-TRASH_TALK
            const roasts = data.brain?.roasts || [];
            if (roasts.length > 0) {
                const randomRoast = roasts[Math.floor(Math.random() * roasts.length)];
                profileContext += `\n# חומר לירידות עליו (אם צריך): "${randomRoast}"\n`;
            }

            return profileContext;

        } catch (error) {
            console.error(`Error fetching user profile for ${userId}:`, error);
            return "";
        }
    }
}

module.exports = new LearningEngine();