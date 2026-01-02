// 📁 handlers/memory.js
const admin = require('firebase-admin');
const { OpenAI } = require('openai');
const { getUserRef, getUserData } = require('../utils/userUtils'); // ✅ חיבור לתשתית החדשה

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * לומד עובדה חדשה על המשתמש ושומר אותה במוח המרכזי.
 */
async function learn(senderId, text, platform = 'whatsapp') {
    // דיגום: לומד רק חלק מההודעות כדי לחסוך טוקנים
    if (text.length < 10 || Math.random() > 0.3) return;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "אתה מנוע זיכרון. חלץ עובדה קצרה על המשתמש מתוך הטקסט (תחביבים, פאדיחות, שם, מקצוע). אם אין, תחזיר ריק. פורמט: FACT: <העובדה>" },
                { role: "user", content: text }
            ],
            max_tokens: 60
        });
        
        const content = completion.choices[0].message.content;
        if (content.includes('FACT:')) {
            const fact = content.replace('FACT:', '').trim();
            const userRef = await getUserRef(senderId, platform);
            
            // שמירה במבנה החדש: brain.facts
            await userRef.set({
                brain: {
                    facts: admin.firestore.FieldValue.arrayUnion({ 
                        content: fact, 
                        date: new Date().toISOString(),
                        source: platform 
                    })
                }
            }, { merge: true });
            
            console.log(`[Memory] 🧠 נלמדה עובדה על ${senderId}: ${fact}`);
        }
    } catch (e) {
        console.error('[Memory] Error:', e.message);
    }
}

/**
 * שולף "חומר" לירידה: שילוב של עובדות שנלמדו + ירידות מוכנות מהפרופיל.
 */
async function getRoast(senderName, senderId, platform = 'whatsapp') {
    try {
        const userData = await getUserData(senderId, platform);
        
        if (!userData) return `סתם בוט בשם ${senderName}`;

        const facts = userData.brain?.facts || [];
        const roasts = userData.brain?.roast_profile || []; // ✅ שואב מה-DB המאוחד
        
        let context = "";

        // 1. הוספת עובדות (עד 3 אחרונות)
        if (facts.length > 0) {
            // לוקח עובדות אקראיות כדי לגוון
            const shuffledFacts = facts.sort(() => 0.5 - Math.random()).slice(0, 3);
            const factsText = shuffledFacts.map(f => f.content).join(". ");
            context += `עובדות ידועות: ${factsText}. `;
        }

        // 2. הוספת ירידה אישית (רנדומלית)
        if (roasts.length > 0) {
            const randomRoast = roasts[Math.floor(Math.random() * roasts.length)];
            context += `ירידה אישית להשתמש בה: "${randomRoast}". `;
        } else {
            // ברירת מחדל אם אין פרופיל
            context += `אין עליו מידע מיוחד, תאלתר משהו על השם ${senderName}.`;
        }

        return context;
    } catch (error) {
        console.error('[Memory] Error getting roast:', error);
        return `המשתמש ${senderName} קצת משעמם היום.`;
    }
}

module.exports = { learn, getRoast };