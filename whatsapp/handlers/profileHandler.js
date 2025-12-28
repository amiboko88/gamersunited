const db = require('../../utils/firebase');
const admin = require('firebase-admin');

let playerProfiles = {};
try {
    const loaded = require('../../data/profiles');
    playerProfiles = loaded.playerProfiles || loaded; 
} catch (e) {
    console.warn("⚠️ data/profiles.js not found.");
}

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
            await db.collection('whatsapp_users').doc(senderId).set({
                discordId: foundDoc.id, isLinked: true, linkedAt: new Date().toISOString(), displayName: waDisplayName
            }, { merge: true });
            return foundDoc.data();
        }
    } catch (error) { console.error("AutoLink Error:", error); }
    return null;
}

async function getUserFullProfile(senderId, senderName) {
    let profile = { waName: senderName, discordData: null, facts: [], roastMaterial: null, justLinked: false };
    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        let doc = await userRef.get();
        let data = doc.exists ? doc.data() : {};
        let discordId = data.discordId;

        if (!discordId) {
            const linkedData = await attemptAutoLinking(senderId, senderName);
            if (linkedData) {
                profile.discordData = linkedData;
                profile.justLinked = true;
                discordId = linkedData.id; 
            }
        } else {
            const discordDoc = await db.collection('users').doc(discordId).get();
            if (discordDoc.exists) profile.discordData = discordDoc.data();
        }
        
        profile.facts = data.facts || [];

        if (playerProfiles) {
            let roasts = [];
            if (discordId && playerProfiles[discordId]) roasts = playerProfiles[discordId];
            else if (playerProfiles.default) roasts = playerProfiles.default;

            if (roasts.length > 0) {
                profile.roastMaterial = roasts[Math.floor(Math.random() * roasts.length)].replace('{userName}', senderName);
            }
        }
    } catch (e) { console.error(e); }
    return profile;
}

async function addFact(senderId, fact) {
    if (!fact) return;
    await db.collection('whatsapp_users').doc(senderId).update({
        facts: admin.firestore.FieldValue.arrayUnion({ content: fact, timestamp: new Date().toISOString() })
    });
}

// --- ✅ ניהול מכסת קול יומית ---
async function checkDailyVoiceLimit(senderId) {
    try {
        const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const userRef = db.collection('whatsapp_users').doc(senderId);
        const doc = await userRef.get();
        
        if (!doc.exists) return true;
        
        const data = doc.data();
        const lastDate = data.voiceUsageDate || "";
        const count = data.dailyVoiceCount || 0;

        // אם תאריך חדש - אפשר (והמונה יתאפס בפונקציית העדכון)
        if (lastDate !== todayStr) return true;
        
        // אם אותו יום - בודקים אם פחות מ-3
        return count < 3;
    } catch (e) {
        console.error("Voice Limit Check Error:", e);
        return false; // במקרה של שגיאה נמנע מלשלוח קול ליתר ביטחון
    }
}

async function incrementVoiceUsage(senderId) {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const userRef = db.collection('whatsapp_users').doc(senderId);
        const doc = await userRef.get();
        let newCount = 1;

        if (doc.exists) {
            const data = doc.data();
            if (data.voiceUsageDate === todayStr) {
                newCount = (data.dailyVoiceCount || 0) + 1;
            }
        }

        await userRef.set({
            voiceUsageDate: todayStr,
            dailyVoiceCount: newCount
        }, { merge: true });
        
    } catch (e) { console.error("Increment Voice Error:", e); }
}

module.exports = { getUserFullProfile, addFact, checkDailyVoiceLimit, incrementVoiceUsage };