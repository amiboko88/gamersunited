// 📁 utils/userUtils.js
const db = require('./firebase');
const admin = require('firebase-admin');

/**
 * מחזיר את הרפרנס למסמך המשתמש הראשי (Master Record).
 * יודע להתמודד עם Discord ID, או לבצע חיפוש דרך טבלאות ה-Lookup.
 * @param {string} id - המזהה (DiscordID, Phone, או TelegramID)
 * @param {'discord'|'whatsapp'|'telegram'} platform - סוג הפלטפורמה (ברירת מחדל: discord)
 */
async function getUserRef(id, platform = 'discord') {
    let targetId = id;

    try {
        // 1. אם זה וואטסאפ - נחפש בטבלת ההמרה
        if (platform === 'whatsapp') {
            const lookupDoc = await db.collection('lookup_whatsapp').doc(id).get();
            if (lookupDoc.exists) {
                targetId = lookupDoc.data().targetId;
            } else {
                // אם אין קישור, נחפש משתמש זמני או ניצור מזהה זמני
                targetId = id.startsWith('wa_') ? id : `wa_${id}`;
            }
        }
        // 2. אם זה טלגרם - נחפש בטבלת ההמרה
        else if (platform === 'telegram') {
            const lookupDoc = await db.collection('lookup_telegram').doc(id.toString()).get();
            if (lookupDoc.exists) {
                targetId = lookupDoc.data().targetId;
            } else {
                targetId = `tg_${id}`;
            }
        }
    } catch (error) {
        console.error(`❌ שגיאה בחיפוש משתמש (${id}):`, error);
    }

    // החזרת הרפרנס למסמך בטבלה הראשית
    return db.collection('users').doc(targetId);
}

/**
 * שולף את נתוני המשתמש המלאים.
 */
async function getUserData(id, platform = 'discord') {
    const ref = await getUserRef(id, platform);
    const doc = await ref.get();
    
    if (!doc.exists) return null;
    return doc.data();
}

/**
 * יוצר או מעדכן משתמש חדש עם מבנה הנתונים המאוחד.
 */
async function ensureUserExists(discordId, displayName) {
    const ref = db.collection('users').doc(discordId);
    const doc = await ref.get();

    if (!doc.exists) {
        const newUser = {
            identity: {
                discordId: discordId,
                displayName: displayName,
                joinedAt: new Date().toISOString()
            },
            economy: { xp: 0, level: 1, balance: 0 },
            stats: { messagesSent: 0, voiceMinutes: 0 },
            brain: { facts: [], sentiment: 0 },
            meta: { firstSeen: new Date().toISOString() }
        };
        await ref.set(newUser);
        return newUser;
    }
    return doc.data();
}

module.exports = {
    getUserRef,
    getUserData,
    ensureUserExists
};