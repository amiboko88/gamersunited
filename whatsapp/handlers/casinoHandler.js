// 📁 whatsapp/handlers/casinoHandler.js
const db = require('../../utils/firebase');
const admin = require('firebase-admin');
const { OpenAI } = require('openai');
const { getUserRef, getUserData } = require('../../utils/userUtils'); // ✅ DB מאוחד

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let activeSession = { isActive: false, startTime: 0, players: [], bets: [] };
let sessionTimer = null;

// AI לפענוח הימורים (הוחזר!)
async function parseBetWithAI(text) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `נתח הימור. החזר JSON: { "amount": number, "target": string, "isValid": boolean }. סלנג: מאייה=100, אלפייה=1000.` },
                { role: "user", content: text }
            ],
            response_format: { type: "json_object" }
        });
        return JSON.parse(completion.choices[0].message.content);
    } catch (e) { return { isValid: false }; }
}

function resetAutoCloseTimer() {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
        if (activeSession.isActive) {
            activeSession.isActive = false;
            // כאן אפשר להוסיף לוגיקה של סגירת רולטה וחישוב תוצאות אם תרצה
            console.log("Casino session auto-closed.");
        }
    }, 120000); // סגירה אחרי 2 דקות שקט
}

// הפונקציה המרכזית לביצוע הימור
async function placeBet(senderId, senderName, text) {
    // 1. נסיון פענוח פשוט (רג'קס)
    let amount = 0;
    let target = "הבית";
    const amountMatch = text.match(/(\d+)/);
    
    if (amountMatch) {
        amount = parseInt(amountMatch[0]);
    } else {
        // 2. אם לא הצלחנו, נשתמש ב-AI (החלק שהיה חסר)
        const aiAnalysis = await parseBetWithAI(text);
        if (aiAnalysis.isValid) {
            amount = aiAnalysis.amount;
            target = aiAnalysis.target;
        }
    }

    if (amount <= 0) return { status: 'invalid' };

    // 3. שליפת נתונים מה-DB המאוחד
    const userData = await getUserData(senderId, 'whatsapp');
    const balance = userData?.economy?.balance || 0;

    // הלוואה אוטומטית (שוק אפור)
    if (balance <= 0) {
        const LOAN = 100;
        const userRef = await getUserRef(senderId, 'whatsapp');
        
        await userRef.update({ 
            'economy.balance': admin.firestore.FieldValue.increment(LOAN) 
        });
        
        return { status: 'broke', loanAmount: LOAN };
    }

    if (balance < amount) {
        return { status: 'insufficient_funds', currentBalance: balance };
    }

    // 4. ביצוע ההימור
    const userRef = await getUserRef(senderId, 'whatsapp');
    await userRef.update({
        'economy.balance': admin.firestore.FieldValue.increment(-amount)
    });

    // ניהול סשן
    if (!activeSession.isActive) {
        startCasinoSession();
    } else {
        resetAutoCloseTimer();
    }

    activeSession.bets.push({ 
        betterId: senderId, 
        betterName: senderName, 
        target, 
        amount,
        timestamp: Date.now() 
    });
    
    return { 
        status: 'success', 
        amount, 
        target, 
        newBalance: balance - amount 
    };
}

function startCasinoSession() {
    activeSession = { isActive: true, startTime: Date.now(), players: [], bets: [] };
    resetAutoCloseTimer();
}

module.exports = { placeBet, startCasinoSession };