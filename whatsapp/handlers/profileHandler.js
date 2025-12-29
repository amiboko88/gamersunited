const db = require('../../utils/firebase');
const admin = require('firebase-admin');

// טעינת הפרופילים הסטטיים (גיבוי)
let playerProfiles = {};
try {
    const loaded = require('../../data/profiles');
    playerProfiles = loaded.playerProfiles || loaded; 
} catch (e) {
    console.warn("⚠️ data/profiles.js not found.");
}

// ניסיון קישור אוטומטי לפי שם (למשתמשים חדשים בעתיד)
async function attemptAutoLinking(senderId, waDisplayName) {
    if (!waDisplayName || waDisplayName.length < 2) return null;
    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) return null;
        
        let foundDoc = null;
        for (const doc of usersSnapshot.docs) {
            const data = doc.data();
            const discordName = (data.displayName || data.username || "").toLowerCase();
            const whatsappName = waDisplayName.toLowerCase();
            
            if (discordName === whatsappName || 
               (discordName.includes(whatsappName) && whatsappName.length > 3) ||
               (whatsappName.includes(discordName) && discordName.length > 3)) {
                foundDoc = doc; break;
            }
        }
        
        if (foundDoc) {
            // יצירת הקשר
            await db.collection('whatsapp_users').doc(senderId).set({
                discordId: foundDoc.id, 
                isLinked: true, 
                linkedAt: new Date().toISOString(), 
                displayName: waDisplayName,
                masterRecordLocation: `users/${foundDoc.id}`
            }, { merge: true });
            
            // עדכון הפלטפורמה גם בתיק האב
            await db.collection('users').doc(foundDoc.id).set({
                platforms: { whatsapp: senderId }
            }, { merge: true });

            return foundDoc.data();
        }
    } catch (error) { console.error("AutoLink Error:", error); }
    return null;
}

// --- 🔥 שליפת הפרופיל המלא (מהתיק המאוחד) ---
async function getUserFullProfile(senderId, senderName) {
    let profile = { 
        waName: senderName, 
        discordData: null, 
        facts: [], 
        roastMaterial: null, 
        justLinked: false,
        discordId: null 
    };

    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        let doc = await userRef.get();
        let data = doc.exists ? doc.data() : {};
        let discordId = data.discordId;

        // ניסיון קישור אם לא קיים
        if (!discordId) {
            const linkedData = await attemptAutoLinking(senderId, senderName);
            if (linkedData) {
                profile.discordData = linkedData;
                profile.justLinked = true;
                discordId = linkedData.id; 
                doc = await userRef.get(); 
                data = doc.data();
            }
        } else {
            // שליפת המידע המלא מתיק האב בדיסקורד
            const discordDoc = await db.collection('users').doc(discordId).get();
            if (discordDoc.exists) {
                profile.discordData = discordDoc.data();
            }
        }
        
        profile.discordId = discordId;

        // מיזוג עובדות - לוקחים הכל מתיק האב (users)
        if (profile.discordData && profile.discordData.facts) {
            profile.facts = profile.discordData.facts;
        }

        // חומר לעקיצות
        if (playerProfiles) {
            let roasts = [];
            if (discordId && playerProfiles[discordId]) {
                roasts = playerProfiles[discordId];
            } else if (playerProfiles.default) {
                roasts = playerProfiles.default;
            }

            if (roasts.length > 0) {
                profile.roastMaterial = roasts[Math.floor(Math.random() * roasts.length)].replace('{userName}', senderName);
            }
        }
    } catch (e) { console.error("GetProfile Error:", e); }
    
    return profile;
}

// --- 🔥 שמירת עובדה (לתוך תיק האב) ---
async function addFact(senderId, fact) {
    if (!fact) return;

    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        const doc = await userRef.get();
        
        let targetRef = userRef; // ברירת מחדל: וואטסאפ

        if (doc.exists) {
            const data = doc.data();
            if (data.discordId) {
                // ✅ המשתמש מקושר! שומרים בתיק האב
                targetRef = db.collection('users').doc(data.discordId);
            }
        }

        await targetRef.update({
            facts: admin.firestore.FieldValue.arrayUnion({ 
                content: fact, 
                timestamp: new Date().toISOString(),
                source: 'shimon_bot' 
            })
        }, { merge: true });

    } catch (error) {
        // גיבוי: יצירת המסמך אם לא קיים
        try {
            await db.collection('whatsapp_users').doc(senderId).set({
                facts: admin.firestore.FieldValue.arrayUnion({ content: fact, timestamp: new Date().toISOString() })
            }, { merge: true });
        } catch (e) {}
    }
}

// בדיקת מכסת קול יומית
async function checkDailyVoiceLimit(senderId) {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const userRef = db.collection('whatsapp_users').doc(senderId);
        const doc = await userRef.get();
        if (!doc.exists) return true;
        const data = doc.data();
        if (data.voiceUsageDate !== todayStr) return true;
        return (data.dailyVoiceCount || 0) < 3;
    } catch (e) { return false; }
}

async function incrementVoiceUsage(senderId) {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const userRef = db.collection('whatsapp_users').doc(senderId);
        await userRef.set({
            voiceUsageDate: todayStr,
            dailyVoiceCount: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
    } catch (e) {}
}

module.exports = { getUserFullProfile, addFact, checkDailyVoiceLimit, incrementVoiceUsage };