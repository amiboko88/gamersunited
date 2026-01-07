// 📁 handlers/ai/learning.js
const { OpenAI } = require('openai');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

// אתחול OpenAI (משתמש במפתח מהסביבה)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class LearningSystem {
    constructor() {
        this.isReady = !!process.env.OPENAI_API_KEY;
        if (!this.isReady) {
            log('⚠️ [Learning] OpenAI API Key missing. Learning disabled.');
        }
    }

    /**
     * המוח הלומד: מקבל הודעה, מנתח אותה, ושומר עובדות אם צריך
     * @param {string} userId - ה-ID של המשתמש
     * @param {string} text - הטקסט שנכתב
     * @param {string} platform - המקור (discord/whatsapp/telegram)
     */
    async learn(userId, text, platform) {
        if (!this.isReady) return;

        // 1. סינון ראשוני: הודעות קצרות מדי, פקודות, או ספאם
        if (!text || text.length < 8 || text.startsWith('/') || text.startsWith('!')) return;

        try {
            // 2. בדיקה האם הטקסט מכיל מידע אישי בעל ערך (AI Analysis)
            // אנחנו לא רוצים לשמור "מה קורה", אלא "אני גר בתל אביב"
            const fact = await this.extractFact(text);

            if (fact) {
                await this.saveMemory(userId, fact, platform);
            }

        } catch (error) {
            console.error(`❌ [Learning] Error processing user ${userId}:`, error.message);
        }
    }

    /**
     * שולח את הטקסט ל-OpenAI כדי להבין אם יש פה עובדה חדשה
     * @returns {Promise<string|null>} העובדה שחולצה או null
     */
    async extractFact(text) {
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini", // מודל מהיר וזול לניתוח
                messages: [
                    {
                        role: "system",
                        content: `You are a background memory processor.
                        Analyze the user's message. If it contains a FACT about the user (name, location, hobby, profession, age, pet, favorite game, specific opinion), extract it as a short, concise sentence in Hebrew.
                        If it's just chit-chat ("hi", "how are you", "lol"), return "FALSE".
                        
                        Example User: "קוראים לי יוסי ואני בן 22"
                        Output: "המשתמש נקרא יוסי והוא בן 22"
                        
                        Example User: "איזה יום יפה היום"
                        Output: "FALSE"`
                    },
                    { role: "user", content: text }
                ],
                temperature: 0,
                max_tokens: 60
            });

            const result = response.choices[0].message.content.trim();
            return result === "FALSE" ? null : result;

        } catch (e) {
            // במקרה של שגיאה ב-AI, מוותרים על הלמידה הספציפית הזו
            return null;
        }
    }

    /**
     * שמירת העובדה ב-DB
     */
    async saveMemory(userId, fact, platform) {
        const userRef = db.collection('users').doc(userId);
        
        // יצירת אובייקט הזיכרון
        const memoryItem = {
            content: fact,
            originalText: fact, // במקרה הזה העובדה המעובדת
            platform: platform,
            timestamp: new Date().toISOString(),
            confidence: 1.0
        };

        // אטומיק אפדייט: הוספה למערך ה-facts בתוך אובייקט brain
        // או שמירה בקולקציית משנה (תלוי במבנה ה-DB שלך, כאן אני שומר למערך ב-doc הראשי לביצועים)
        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(userRef);
                const data = doc.data() || {};
                const brain = data.brain || {};
                const facts = brain.facts || [];

                // בדיקה אם העובדה כבר קיימת (למנוע כפילויות)
                const exists = facts.some(f => f.content === fact);
                if (!exists) {
                    facts.push(memoryItem);
                    // שומרים רק את ה-20 האחרונים כדי לא להעמיס
                    if (facts.length > 20) facts.shift();
                    
                    t.set(userRef, { brain: { ...brain, facts } }, { merge: true });
                    log(`🧠 [Learning] נלמד מידע חדש על ${userId}: "${fact}"`);
                }
            });
        } catch (e) {
            console.error(`❌ [Learning] DB Save Error:`, e);
        }
    }

    /**
     * שליפת הקונטקסט עבור ה-Brain הראשי
     */
    async getContext(userId) {
        try {
            const doc = await db.collection('users').doc(userId).get();
            if (!doc.exists) return "";

            const data = doc.data();
            const facts = data.brain?.facts || [];
            
            if (facts.length === 0) return "";

            return facts.map(f => `- ${f.content}`).join('\n');
        } catch (e) {
            return "";
        }
    }
}

// ✅ ייצוא מופע (Instance) כדי לתקן את שגיאת "memory.learn is not a function"
module.exports = new LearningSystem();