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
                discordId: foundDoc.id, 
                isLinked: true, 
                linkedAt: new Date().toISOString(), 
                displayName: waDisplayName,
                masterRecordLocation: `users/${foundDoc.id}`
            }, { merge: true });
            
            await db.collection('users').doc(foundDoc.id).set({
                platforms: { whatsapp: senderId }
            }, { merge: true });

            return foundDoc.data();
        }
    } catch (error) { console.error("AutoLink Error:", error); }
    return null;
}

// --- 🔥 שליפת הפרופיל המלא + סטטיסטיקות ---
async function getUserFullProfile(senderId, senderName) {
    let profile = { 
        waName: senderName, 
        discordData: null, 
        facts: [], 
        roastMaterial: null, 
        justLinked: false,
        discordId: null,
        whatsappData: null // הוספנו את זה
    };

    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        let doc = await userRef.get();
        let data = doc.exists ? doc.data() : {};
        
        profile.whatsappData = data; // שמירת הנתונים הגולמיים (כולל totalMessages)
        let discordId = data.discordId;

        if (!discordId) {
            const linkedData = await attemptAutoLinking(senderId, senderName);
            if (linkedData) {
                profile.discordData = linkedData;
                profile.justLinked = true;
                discordId = linkedData.id; 
                doc = await userRef.get(); 
                data = doc.data();
                profile.whatsappData = data;
            }
        } else {
            const discordDoc = await db.collection('users').doc(discordId).get();
            if (discordDoc.exists) {
                profile.discordData = discordDoc.data();
            }
        }
        
        profile.discordId = discordId;

        if (profile.discordData && profile.discordData.facts) {
            profile.facts = profile.discordData.facts;
        }

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

async function addFact(senderId, fact) {
    if (!fact) return;
    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        const doc = await userRef.get();
        let targetRef = userRef;
        if (doc.exists && doc.data().discordId) {
            targetRef = db.collection('users').doc(doc.data().discordId);
        }
        await targetRef.update({
            facts: admin.firestore.FieldValue.arrayUnion({ 
                content: fact, 
                timestamp: new Date().toISOString(),
                source: 'shimon_bot' 
            })
        }, { merge: true });
    } catch (error) {
        try {
            await db.collection('whatsapp_users').doc(senderId).set({
                facts: admin.firestore.FieldValue.arrayUnion({ content: fact, timestamp: new Date().toISOString() })
            }, { merge: true });
        } catch (e) {}
    }
}

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

// ✅ פונקציה חדשה: ספירת הודעות כללית לחישוב דרגות
async function incrementTotalMessages(senderId) {
    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        await userRef.set({
            totalMessages: admin.firestore.FieldValue.increment(1),
            lastActive: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.error('Error updating msg count:', e);
    }
}

module.exports = { 
    getUserFullProfile, 
    addFact, 
    checkDailyVoiceLimit, 
    incrementVoiceUsage,
    incrementTotalMessages // ייצוא החדש
};