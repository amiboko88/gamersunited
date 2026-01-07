// 📁 handlers/ai/learning.js
const { OpenAI } = require('openai');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class LearningSystem {
    constructor() {
        this.isReady = !!process.env.OPENAI_API_KEY;
        if (!this.isReady) {
            log('⚠️ [Learning] OpenAI API Key missing. Learning disabled.');
        }
    }

    /**
     * פונקציית הלמידה הראשית (נקראת ע"י הוואטסאפ והדיסקורד)
     * מבצעת ניתוח AI ושומרת עובדות
     */
    async learnFromContext(userId, userName, platform, text) {
        if (!this.isReady) return;
        
        // סינון רעשים
        if (!text || text.length < 8 || text.startsWith('/') || text.startsWith('!')) return;

        try {
            const fact = await this.extractFact(text);
            if (fact) {
                await this.saveMemory(userId, fact, platform);
            }
        } catch (error) {
            console.error(`❌ [Learning] Error processing user ${userId}:`, error.message);
        }
    }

    /**
     * שליפת הפרופיל המלא לשימוש במוח (Brain)
     * כולל עובדות (Facts) וירידות (Roasts)
     */
    async getUserProfile(userId, platform) {
        try {
            const doc = await db.collection('users').doc(userId).get();
            if (!doc.exists) return "";

            const data = doc.data();
            const brainData = data.brain || {};
            let profileContext = "";

            // 1. הוספת עובדות (Facts)
            const facts = brainData.facts || [];
            if (facts.length > 0) {
                // לוקח את ה-10 האחרונים
                const recentFacts = facts.slice(-10).map(f => `- ${f.content}`).join('\n');
                profileContext += `\n# דברים שאני יודע עליו (עובדות שנשמרו):\n${recentFacts}\n`;
            }

            // 2. הוספת פרופיל ירידות (Roast Profile)
            const roastProfile = data.roastProfile || {};
            if (roastProfile.style || roastProfile.weaknesses) {
                profileContext += `\n# איך לרדת עליו (Roast Profile):\n`;
                if (roastProfile.style) profileContext += `- סגנון דיבור: ${roastProfile.style}\n`;
                if (roastProfile.weaknesses) profileContext += `- נקודות תורפה: ${roastProfile.weaknesses}\n`;
                if (roastProfile.topics) profileContext += `- נושאים רגישים: ${roastProfile.topics}\n`;
            }

            // 3. ירידות ספציפיות מוכנות (Roasts Array)
            const savedRoasts = brainData.roasts || [];
            if (savedRoasts.length > 0) {
                // בוחר ירידה אקראית אחת לשימוש
                const randomRoast = savedRoasts[Math.floor(Math.random() * savedRoasts.length)];
                profileContext += `\n# דוגמה לירידה עליו מהעבר:\n"${randomRoast}"\n`;
            }

            return profileContext;

        } catch (e) {
            console.error('Error fetching user profile:', e);
            return "";
        }
    }

    // --- פונקציות עזר פנימיות ---

    async extractFact(text) {
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `Analyze the user's message. If it contains a FACT about the user (name, location, hobby, profession, age, pet, opinion), extract it as a short Hebrew sentence. If just chat, return "FALSE".`
                    },
                    { role: "user", content: text }
                ],
                temperature: 0,
                max_tokens: 60
            });

            const result = response.choices[0].message.content.trim();
            return result === "FALSE" ? null : result;
        } catch (e) {
            return null;
        }
    }

    async saveMemory(userId, fact, platform) {
        const userRef = db.collection('users').doc(userId);
        const memoryItem = {
            content: fact,
            platform: platform,
            timestamp: new Date().toISOString()
        };

        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(userRef);
                const data = doc.data() || {};
                const brain = data.brain || {};
                const facts = brain.facts || [];

                // מניעת כפילויות
                const exists = facts.some(f => f.content === fact);
                if (!exists) {
                    facts.push(memoryItem);
                    if (facts.length > 30) facts.shift(); // שומרים 30 אחרונים
                    t.set(userRef, { brain: { ...brain, facts } }, { merge: true });
                    // log(`🧠 [Learning] נלמד: ${fact}`);
                }
            });
        } catch (e) {
            console.error(`❌ [Learning] DB Save Error:`, e);
        }
    }
}

module.exports = new LearningSystem();