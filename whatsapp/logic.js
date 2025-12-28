// ✅ ה-LID שלך (המנהל)
const ADMIN_NUMBER = '100772834480319'; 

const { delay } = require('@whiskeysockets/baileys');
const db = require('../utils/firebase');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GLOBAL_COOLDOWN = 2000; 
let lastBotReplyTime = 0;
const spamTracker = new Map(); 

// --- מנוע זיהוי אוטומטי (Auto-Discovery) ---
async function attemptAutoLinking(senderId, waDisplayName) {
    if (!waDisplayName || waDisplayName.length < 2) return null;

    try {
        // שולפים את כל המשתמשים מהדיסקורד (בגלל שהקהילה קטנה זה בסדר גמור)
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) return null;

        // חיפוש חכם: האם השם בוואטסאפ מוכל בתוך השם בדיסקורד (או להפך)
        // לדוגמה: וואטסאפ: "Yogi", דיסקורד: "YogiMaster" -> התאמה!
        let foundDoc = null;
        
        for (const doc of usersSnapshot.docs) {
            const data = doc.data();
            const discordName = (data.displayName || data.username || "").toLowerCase();
            const whatsappName = waDisplayName.toLowerCase();

            // התנאי: התאמה מדויקת או שהאחד מכיל את השני (מינימום 3 תווים למנוע טעויות)
            if (discordName === whatsappName || 
               (discordName.includes(whatsappName) && whatsappName.length > 3) ||
               (whatsappName.includes(discordName) && discordName.length > 3)) {
                
                foundDoc = doc;
                break; // מצאנו! עוצרים.
            }
        }

        if (foundDoc) {
            log(`[Auto-Link] ✅ Match found! WhatsApp: "${waDisplayName}" -> Discord: "${foundDoc.data().displayName}"`);
            
            // שמירת הקישור
            await db.collection('whatsapp_users').doc(senderId).set({
                discordId: foundDoc.id,
                isLinked: true,
                linkedAt: new Date().toISOString(),
                displayName: waDisplayName // מעדכן גם את השם
            }, { merge: true });

            return foundDoc.data(); // מחזיר את המידע כדי שנשתמש בו מיד
        }

    } catch (error) {
        console.error("Auto-Link Error:", error);
    }
    return null;
}

// --- שליפת נתונים לסטטיסטיקה ---
async function getTopGrinders() {
    try {
        const snapshot = await db.collection('users').orderBy('xp', 'desc').limit(7).get();
        if (snapshot.empty) return "אין נתונים, השרת יבש.";
        let report = "📊 **טבלת הכרישים (XP):**\n";
        snapshot.forEach((doc, index) => {
            const data = doc.data();
            report += `${index + 1}. ${data.displayName || 'פלוני'} - רמה ${data.level || 1}\n`;
        });
        return report;
    } catch (error) { return null; }
}

// --- אישיות ---
const SHIMON_PERSONA = `
אתה שמעון. בוט וואטסאפ ישראלי, "ערס" צעצוע, קצר רוח, אבל חד.
החוקים שלך:
1. **סגנון:** סלנג כבד, קצר ולעניין (עד 15 מילים).
2. **זיהוי משתמש:** המערכת תגיד לך מי מדבר איתך ומה הנתונים שלו בדיסקורד.
   - אם הוא רמה גבוהה: תן לו כבוד (או תגיד שהוא חסר חיים).
   - אם הוא רמה נמוכה: תרד עליו ("יא נוב", "בוט").
3. **מידע:** אם מבקשים רשימה - תן אותה, אבל תתלונן.
`;

// --- אנטי ספאם ---
function checkSpam(userId) {
    const now = Date.now();
    let userData = spamTracker.get(userId) || { count: 0, blockedUntil: 0, lastMsg: 0 };
    if (now < userData.blockedUntil) return { isBlocked: true, shouldAlert: false };
    if (now - userData.lastMsg > 30000) userData.count = 0;
    userData.count++;
    userData.lastMsg = now;
    if (userData.count >= 4) {
        userData.blockedUntil = now + 60000;
        spamTracker.set(userId, userData);
        return { isBlocked: true, shouldAlert: true };
    }
    spamTracker.set(userId, userData);
    return { isBlocked: false, shouldAlert: false };
}

// --- ניהול פרופיל (עם בדיקת חיבור אוטומטית) ---
async function getUserFullProfile(senderId, senderName) {
    let profile = { waName: senderName, discordData: null, facts: [], justLinked: false };
    
    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        let doc = await userRef.get();
        let data = doc.exists ? doc.data() : {};

        // 🔍 בדיקה: האם המשתמש מקושר?
        if (!data.discordId) {
            // לא מקושר -> ננסה זיהוי אוטומטי עכשיו!
            const linkedData = await attemptAutoLinking(senderId, senderName);
            if (linkedData) {
                profile.discordData = linkedData;
                profile.justLinked = true; // דגל כדי ששמעון יגיב לזה
                // מרעננים את המסמך המקומי
                data = { facts: data.facts || [] }; 
            }
        } else {
            // כן מקושר -> שולפים מידע
            const discordDoc = await db.collection('users').doc(data.discordId).get();
            if (discordDoc.exists) {
                profile.discordData = discordDoc.data();
            }
        }
        
        profile.facts = data.facts || [];

        // עדכון סטטיסטיקה כללי
        await userRef.set({
             id: senderId,
             displayName: senderName,
             lastMessageAt: new Date().toISOString(),
             messageCount: admin.firestore.FieldValue.increment(1)
        }, { merge: true });

    } catch (e) { console.error(e); }
    return profile;
}

// --- הלוגיקה הראשית ---
async function handleMessageLogic(sock, msg, text) {
    const chatJid = msg.key.remoteJid; 
    const isGroup = chatJid.endsWith('@g.us');
    const senderFullJid = isGroup ? (msg.key.participant || msg.participant) : chatJid;
    const senderId = senderFullJid ? senderFullJid.split('@')[0] : 'unknown';
    const isAdmin = senderId === ADMIN_NUMBER;

    if (!isGroup && !isAdmin) return; 

    const spamStatus = checkSpam(senderId);
    if (spamStatus.isBlocked) {
        if (spamStatus.shouldAlert) await sock.sendMessage(chatJid, { text: "שחרר, אתה בחסימה. סע." }, { quoted: msg });
        return; 
    }

    const senderName = msg.pushName || "לא ידוע";
    
    // שליפת פרופיל (כולל ניסיון חיבור אוטומטי ברקע)
    const userProfile = await getUserFullProfile(senderId, senderName);

    const now = Date.now();
    const lowerText = text.toLowerCase();
    let shouldTrigger = false;
    let injectedData = ""; 

    if (lowerText.includes('רשימה') || lowerText.includes('פעילים') || lowerText.includes('דירוג')) {
        injectedData = await getTopGrinders(); 
        shouldTrigger = true;
    }
    else if (lowerText.includes('שמעון') || lowerText.includes('shimon')) {
        shouldTrigger = true;
    }
    else if ((lowerText.includes('דמג') || lowerText.includes('נזק')) && /\d{3,}/.test(text)) {
        shouldTrigger = true;
        injectedData = "[דיווח נזק WARZONE. אם מעל 3000 תפרגן, אחרת רד עליו]";
    }

    // אם הרגע זיהינו אותו אוטומטית - חייבים להגיב!
    if (userProfile.justLinked) {
        shouldTrigger = true;
        injectedData += ` [הודעת מערכת: זיהיתי עכשיו לראשונה שהמשתמש הזה הוא ${userProfile.discordData.displayName} מהדיסקורד! תן לו עקיצה על זה שקלטת מי הוא.]`;
    }

    if (!isGroup) shouldTrigger = true;
    if (!shouldTrigger) return;
    if (now - lastBotReplyTime < GLOBAL_COOLDOWN) return;

    lastBotReplyTime = now;
    await sock.sendPresenceUpdate('composing', chatJid);

    let systemMsg = SHIMON_PERSONA;
    
    if (userProfile.discordData) {
        const d = userProfile.discordData;
        systemMsg += `\n\n💡 **זיהוי משתמש:** זה "${d.displayName}"!\nרמה: ${d.level}, XP: ${d.xp}.\nתתאים את היחס שלך לרמה שלו.`;
    }

    if (injectedData) systemMsg += `\n\n📌 מידע: ${injectedData}`;
    const userFacts = userProfile.facts ? userProfile.facts.map(f => f.content).join(". ") : "";
    if (userFacts) systemMsg += `\n\nעובדות: ${userFacts}`;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: text }
            ],
            max_tokens: 200,
            temperature: 0.85
        });

        const replyText = completion.choices[0]?.message?.content?.trim();
        await delay(1000); 
        await sock.sendMessage(chatJid, { text: replyText }, { quoted: msg });
        await sock.sendPresenceUpdate('paused', chatJid);

    } catch (error) { console.error('AI Error:', error); }
}

module.exports = { handleMessageLogic };