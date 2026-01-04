// 📁 handlers/antispam.js
const admin = require('firebase-admin');
const { getUserRef } = require('../utils/userUtils'); // ✅ DB מאוחד
const { sendStaffLog } = require('../utils/staffLogger'); // ✅ לוגר מרכזי
const { checkContentSafety } = require('./smartChat'); // ✅ בדיקת AI חכמה

/**
 * בודק אם הודעה בטוחה באמצעות AI ומבצע פעולות אם לא.
 * מחליף את רשימות המילים הישנות.
 * @param {import('discord.js').Message} message 
 */
async function checkMessageSafety(message) {
    if (!message.content || message.author.bot) return true; // בטוח

    // בדיקה מול ה-AI של OpenAI (דרך smartChat)
    const safetyResult = await checkContentSafety(message.content);

    if (!safetyResult.isSafe) {
        // 🚨 זוהתה הפרה!
        try {
            // 1. מחיקת ההודעה
            if (message.deletable) await message.delete();

            // 2. דיווח לצוות ול-DB
            await logViolationToStaff(
                message.author.id, 
                message.author.displayName || message.author.username, 
                safetyResult.category, // הקטגוריה שה-AI זיהה (למשל: harassment/violence)
                message.content, 
                message.guild
            );

            // 3. שליחת אזהרה למשתמש בפרטי
            await message.author.send(`🛑 **הודעתך נמחקה.**\nהמערכת זיהתה תוכן מסוג: \`${safetyResult.category}\`.\nנא לשמור על שפה נקייה בשרת.`).catch(() => {});

        } catch (error) {
            console.error('[AntiSpam] Error handling violation:', error);
        }
        return false; // לא בטוח (ההודעה טופלה)
    }

    return true; // בטוח
}

/**
 * מתעד תגובה של משתמש להודעת אזהרה בפרטי (DM)
 */
async function logDmReply(userId, content, guild) {
    // 1. דיווח לצוות
    await sendStaffLog(
        '📬 תגובה לאזהרת DM',
        content,
        'Orange',
        [{ name: 'משתמש', value: `<@${userId}> (${userId})` }]
    );

    // 2. תיעוד ב-DB המאוחד
    try {
        const userRef = await getUserRef(userId, 'discord');
        await userRef.update({
            'history.dmResponses': admin.firestore.FieldValue.arrayUnion({
                content: content,
                timestamp: new Date().toISOString(),
                type: 'reply_to_warning'
            }),
            'tracking.lastActive': new Date().toISOString()
        });
    } catch (e) { 
        console.error(`[AntiSpam] Error logging DM reply for ${userId}:`, e); 
    }
}

/**
 * מתעד מקרה שבו משתמש לא הגיב לאזהרה תוך זמן קצוב
 */
async function logNoReplyToStaff(userId, guild) {
    // 1. דיווח לצוות
    await sendStaffLog(
        '⏱️ לא התקבלה תגובה ל־DM',
        `<@${userId}> לא הגיב תוך 24 שעות להודעת הבוט.`,
        'Yellow'
    );

    // 2. עדכון סטטוס ב-DB
    try {
        const userRef = await getUserRef(userId, 'discord');
        await userRef.set({
            tracking: { lastDmStatus: 'no_reply_timeout' }
        }, { merge: true });
    } catch (e) {
        console.error(`[AntiSpam] Error logging no-reply for ${userId}:`, e);
    }
}

/**
 * מתעד הפרת חוקים (שה-AI זיהה)
 */
async function logViolationToStaff(userId, displayName, type, originalContent, guild) {
    // 1. דיווח לצוות
    await sendStaffLog(
        '🚨 זוהתה הפרת חוקים (AI)',
        `סוג ההפרה: **${type}**`,
        'Red',
        [
            { name: 'משתמש', value: `<@${userId}> (${displayName})` },
            { name: 'תוכן ההודעה', value: `||${originalContent}||` } // ספוילר
        ]
    );

    // 2. רישום ההפרה בתיק האישי ("הספר השחור")
    try {
        const userRef = await getUserRef(userId, 'discord');
        
        await userRef.update({
            'history.infractions': admin.firestore.FieldValue.arrayUnion({
                type: type,
                content: originalContent,
                date: new Date().toISOString(),
                severity: 'high',
                detectedBy: 'AI_Moderation'
            }),
            'stats.warningCount': admin.firestore.FieldValue.increment(1)
        });
        
    } catch (e) { 
        console.error(`[AntiSpam] Error logging infraction for ${userId}:`, e); 
    }
}

module.exports = {
    checkMessageSafety,
    logDmReply,
    logNoReplyToStaff,
    logViolationToStaff
};