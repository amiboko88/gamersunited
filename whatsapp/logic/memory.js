const db = require('../../utils/firebase');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// מטמון זיכרון לביצועים מהירים (כדי לא לפנות ל-DB על כל הודעה)
const memoryCache = new Map();

/**
 * פונקציית עזר למציאת התיק הראשי (Master Record)
 */
async function getMasterDocRef(senderId) {
    const waRef = db.collection('whatsapp_users').doc(senderId);
    const waDoc = await waRef.get();
    
    if (waDoc.exists && waDoc.data().discordId) {
        // המשתמש מקושר - הולכים לתיק הראשי בדיסקורד
        return db.collection('users').doc(waDoc.data().discordId);
    }
    // לא מקושר - נשארים בוואטסאפ
    return waRef;
}

async function learn(senderId, text) {
    // דיגום: לומד רק 20% מההודעות כדי לחסוך טוקנים, אלא אם כן זה משפט משמעותי
    if (text.length < 10 || Math.random() > 0.3) return; 

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "חלץ עובדות על המשתמש (תחביבים, פאדיחות, שם, מקצוע). אם אין, תחזיר ריק. פורמט: FACT: <העובדה>" },
                { role: "user", content: text }
            ],
            max_tokens: 60
        });
        
        const content = completion.choices[0].message.content;
        if (content.includes('FACT:')) {
            const fact = content.replace('FACT:', '').trim();
            const targetRef = await getMasterDocRef(senderId); // 🔥 הכתיבה הולכת למקום הנכון
            
            await targetRef.update({
                facts: admin.firestore.FieldValue.arrayUnion({ content: fact, date: new Date().toISOString() })
            });
            console.log(`[Memory] 🧠 Learned about ${senderId}: ${fact}`);
        }
    } catch (e) {
        // התעלמות משגיאות למידה שקטות
    }
}

async function getRoast(senderName, senderId) {
    try {
        const targetRef = await getMasterDocRef(senderId); // 🔥 הקריאה מהמקום הנכון
        const doc = await targetRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            // אם יש עובדות בספר השחור - נשתמש בהן
            if (data.facts && data.facts.length > 0) {
                const randomFact = data.facts[Math.floor(Math.random() * data.facts.length)].content;
                return `פרט מביך עליו: ${randomFact}`;
            }
        }
    } catch (e) {}
    
    // ברירת מחדל אם אין מידע
    return "עוד גיימר גנרי שחושב שהוא יודע לשחק.";
}

module.exports = { learn, getRoast };