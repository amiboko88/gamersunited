const db = require('../../utils/firebase');
const admin = require('firebase-admin');

// 🔥 הגדרת הדרגות והפרסים
const RANKS = [
    { name: 'בוט מתחיל', min: 0, reward: 0 },
    { name: 'טירון', min: 50, reward: 150 },
    { name: 'לוחם', min: 200, reward: 400 },
    { name: 'מתנקש', min: 600, reward: 1000 },
    { name: 'קומנדו', min: 1200, reward: 2500 },
    { name: 'אגדה', min: 2500, reward: 5000 }
];

// טעינת פרופילים סטטיים
let playerProfiles = {};
try {
    const loaded = require('../../data/profiles');
    playerProfiles = loaded.playerProfiles || loaded; 
} catch (e) {}

async function attemptAutoLinking(senderId, waDisplayName) {
    if (!waDisplayName || waDisplayName.length < 2) return null;
    try {
        const usersSnapshot = await db.collection('users').get();
        let foundDoc = null;
        for (const doc of usersSnapshot.docs) {
            const data = doc.data();
            const discordName = (data.displayName || data.username || "").toLowerCase();
            const whatsappName = waDisplayName.toLowerCase();
            if (discordName === whatsappName || (whatsappName.includes(discordName) && discordName.length > 3)) {
                foundDoc = doc; break;
            }
        }
        if (foundDoc) {
            await db.collection('whatsapp_users').doc(senderId).set({
                discordId: foundDoc.id, 
                isLinked: true, 
                linkedAt: new Date().toISOString(), 
                displayName: waDisplayName, // הנה השם!
                masterRecordLocation: `users/${foundDoc.id}`
            }, { merge: true });
            
            await db.collection('users').doc(foundDoc.id).set({
                platforms: { whatsapp: senderId }
            }, { merge: true });
            return foundDoc.data();
        }
    } catch (error) {}
    return null;
}

async function getUserFullProfile(senderId, senderName) {
    let profile = { waName: senderName, discordData: null, facts: [], roastMaterial: null, whatsappData: null };
    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        let doc = await userRef.get();
        let data = doc.exists ? doc.data() : {};
        profile.whatsappData = data;
        
        let discordId = data.discordId;
        if (!discordId) {
            const linkedData = await attemptAutoLinking(senderId, senderName);
            if (linkedData) {
                profile.discordData = linkedData;
                discordId = linkedData.id; 
            }
        } else {
            const discordDoc = await db.collection('users').doc(discordId).get();
            if (discordDoc.exists) profile.discordData = discordDoc.data();
        }

        // שליפת עובדות (מהמאסטר רקורד)
        if (profile.discordData && profile.discordData.facts) profile.facts = profile.discordData.facts;
        else if (data.facts) profile.facts = data.facts;

        // רוסטים
        if (playerProfiles) {
            let roasts = [];
            if (discordId && playerProfiles[discordId]) roasts = playerProfiles[discordId];
            else if (playerProfiles.default) roasts = playerProfiles.default;
            if (roasts.length > 0) profile.roastMaterial = roasts[Math.floor(Math.random() * roasts.length)].replace('{userName}', senderName);
        }
    } catch (e) {}
    return profile;
}

async function checkDailyVoiceLimit(senderId) {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const userRef = db.collection('whatsapp_users').doc(senderId);
        const doc = await userRef.get();
        if (!doc.exists) return true;
        return (doc.data().dailyVoiceCount || 0) < 3; // מגבלה יומית
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

// 🔥 השינוי: מקבל גם את senderName כדי לתקן את ה-"Unknown User" בדאטה בייס
async function incrementTotalMessages(senderId, senderName) {
    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        
        const result = await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            
            // עדכון שם המשתמש (Self-Healing)
            t.set(userRef, { 
                displayName: senderName, // <-- התיקון הקריטי!
                lastActive: new Date().toISOString() 
            }, { merge: true });

            if (!doc.exists) {
                t.set(userRef, { totalMessages: 1 }, { merge: true });
                return { leveledUp: false };
            }

            const currentMsgs = (doc.data().totalMessages || 0) + 1;
            t.update(userRef, { totalMessages: currentMsgs });

            // בדיקת רמות
            const newRank = RANKS.find(r => r.min === currentMsgs);
            if (newRank && newRank.min > 0) {
                // הבונוס הולך למאסטר רקורד (דיסקורד) אם קיים
                let targetRef = userRef;
                if (doc.data().discordId) {
                    targetRef = db.collection('users').doc(doc.data().discordId);
                }
                t.update(targetRef, { xp: admin.firestore.FieldValue.increment(newRank.reward) });

                return { leveledUp: true, rankName: newRank.name, reward: newRank.reward, totalMessages: currentMsgs };
            }
            return { leveledUp: false };
        });
        return result;
    } catch (e) { return null; }
}

async function addFact(senderId, fact) {
    // פונקציית גיבוי, הרוב נעשה דרך memory.js החכם יותר
    try {
        const userRef = db.collection('whatsapp_users').doc(senderId);
        const doc = await userRef.get();
        let targetRef = userRef;
        if (doc.exists && doc.data().discordId) targetRef = db.collection('users').doc(doc.data().discordId);
        
        await targetRef.update({
            facts: admin.firestore.FieldValue.arrayUnion({ content: fact, date: new Date().toISOString() })
        });
    } catch (e) {}
}

module.exports = { 
    getUserFullProfile, addFact, checkDailyVoiceLimit, 
    incrementVoiceUsage, incrementTotalMessages, attemptAutoLinking 
};