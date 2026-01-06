// 📁 handlers/memory.js
const admin = require('firebase-admin');
const { OpenAI } = require('openai');
const { getUserRef, getUserData } = require('../utils/userUtils');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * לומד עובדה חדשה על המשתמש ושומר אותה במוח המרכזי.
 */
async function learn(senderId, text, platform = 'whatsapp') {
    // סינון רעשים: משפטים קצרים מדי לא מלמדים כלום
    if (text.length < 15 || Math.random() > 0.4) return;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "אתה מנוע זיכרון. אם הטקסט מכיל פרט מידע מעניין על המשתמש (תחביב, מקצוע, פאדיחה, שם חיבה), חלץ אותו. אם סתם דיבורים, תחזיר ריק. פורמט: FACT: <העובדה>" },
                { role: "user", content: text }
            ],
            max_tokens: 60
        });
        
        const content = completion.choices[0].message.content;
        if (content.includes('FACT:')) {
            const fact = content.replace('FACT:', '').trim();
            const userRef = await getUserRef(senderId, platform);
            
            await userRef.update({
                'brain.facts': admin.firestore.FieldValue.arrayUnion({ 
                    content: fact, 
                    date: new Date().toISOString(),
                    source: platform 
                })
            });
            
            console.log(`[Memory] 🧠 נלמדה עובדה על ${senderId}: ${fact}`);
        }
    } catch (e) {
        // התעלמות משגיאות למידה כדי לא להציף לוגים
    }
}

/**
 * שולף "תחמושת" (Roast Material) לירידה על המשתמש
 */
async function getRoast(senderName, senderId, platform = 'whatsapp') {
    try {
        const userData = await getUserData(senderId, platform);
        
        // אם אין דאטה בכלל - ברירת מחדל
        if (!userData) return `שם: ${senderName}. אין מידע מיוחד. רד עליו שהוא "בוט גנרי" בלי היסטוריה.`;

        const facts = userData.brain?.facts || [];
        const roasts = userData.brain?.roasts || []; 
        const balance = userData.economy?.balance || 0;
        
        let ammo = [];

        // 1. הוספת ירידה "כואבת" מהמאגר (אם יש)
        if (roasts.length > 0) {
            const randomRoast = roasts[Math.floor(Math.random() * roasts.length)];
            ammo.push(`🔥 נקודה רגישה אצלו: "${randomRoast}"`);
        }

        // 2. הוספת עובדות (עד 2 עובדות אקראיות)
        if (facts.length > 0) {
            const shuffledFacts = facts.sort(() => 0.5 - Math.random()).slice(0, 2);
            const factsText = shuffledFacts.map(f => f.content).join(", ");
            ammo.push(`💡 עובדות עליו: ${factsText}`);
        }

        // 3. מצב כלכלי (תמיד רלוונטי לירידות)
        if (balance < 100) {
            ammo.push(`💸 מצב כלכלי: עני מרוד (יש לו רק ₪${balance}). רד על זה.`);
        } else if (balance > 10000) {
            ammo.push(`💰 מצב כלכלי: טחון בכסף (₪${balance}). תשאל מאיפה הכסף.`);
        }

        // אם אין כלום - המצאה
        if (ammo.length === 0) {
            return `שם: ${senderName}. אין מידע ספציפי. תאלתר ירידה על השם שלו או על זה שהוא משעמם.`;
        }

        return ammo.join("\n");

    } catch (error) {
        console.error('[Memory] Error getting roast:', error);
        return `המשתמש ${senderName} לא מעניין.`;
    }
}

module.exports = { learn, getRoast };