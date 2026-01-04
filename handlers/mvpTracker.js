// 📁 handlers/mvpTracker.js
const admin = require('firebase-admin');
const { renderMvpImage } = require('./mvpRenderer');
const { log } = require('../utils/logger');
const db = require('../utils/firebase'); 
const { getUserData, getUserRef } = require('../utils/userUtils'); // ✅ עבודה דרך המוח המרכזי
const { sendToMainGroup } = require('../whatsapp/index');

const MVP_CHANNEL_ID = '583575179880431616';
const MVP_REWARD = 1000; // פרס כספי לזוכה

let lastPrintedDate = null;

/**
 * הפונקציה הראשית שרצה פעם בשבוע (דרך Cron)
 * בודקת מי המנצח, מכריזה עליו, ומאפסת את הטבלה.
 */
async function checkMVPStatusAndRun(client) {
    // חישוב זמן (יום ראשון)
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // התאמה לשעון ישראל
    const today = now.toISOString().split('T')[0];
    const day = now.getDay(); // 0 = ראשון

    // מריצים רק בימי ראשון
    if (day !== 0) return;

    // בדיקה האם כבר רץ היום (מונע כפילויות)
    const statusRef = db.doc('system_metadata/mvp_status'); // ✅ מיקום מסודר יותר
    const statusSnap = await statusRef.get();
    const statusData = statusSnap.exists ? statusSnap.data() : null;

    if (statusData?.lastAnnouncedDate === today) {
        if (lastPrintedDate !== today) {
            lastPrintedDate = today;
            log(`⛔ MVP כבר הוכרז היום (${today}). מדלג.`);
        }
        return;
    }

    log('🏆 מתחיל חישוב MVP שבועי...');

    // 1. שליפת המובילים מהטבלה השבועית (weeklyStats נשמר כאוסף זמני וזה בסדר)
    const snapshot = await db.collection('weeklyStats').get();
    if (snapshot.empty) {
        log('⚠️ אין נתונים שבועיים לחישוב MVP.');
        return;
    }

    let bestUser = null;
    let maxMinutes = -1;

    snapshot.forEach(doc => {
        const data = doc.data();
        const minutes = data.voiceMinutes || 0;
        if (minutes > maxMinutes) {
            maxMinutes = minutes;
            bestUser = { id: doc.id, ...data };
        }
    });

    if (!bestUser || maxMinutes <= 0) {
        log('⚠️ לא נמצא מנצח עם דקות חיוביות.');
        return;
    }

    // 2. שליפת פרטי המנצח מה-DB המאוחד
    const winnerData = await getUserData(bestUser.id, 'discord');
    const discordUser = await client.users.fetch(bestUser.id).catch(() => null);
    
    const displayName = winnerData?.identity?.displayName || discordUser?.username || 'Unknown Soldier';
    const avatarURL = discordUser?.displayAvatarURL({ extension: 'png', size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    log(`🎉 המנצח השבועי הוא: ${displayName} עם ${Math.floor(maxMinutes)} דקות!`);

    // 3. עדכון זכייה בתיק המשתמש (DB מאוחד)
    const userRef = await getUserRef(bestUser.id, 'discord');
    await userRef.update({
        'economy.balance': admin.firestore.FieldValue.increment(MVP_REWARD),
        'economy.mvpWins': admin.firestore.FieldValue.increment(1),
        'stats.totalVoiceMinutes': admin.firestore.FieldValue.increment(maxMinutes)
    });

    // 4. יצירת תמונת הניצחון
    const imagePath = await renderMvpImage({
        username: displayName,
        avatarURL: avatarURL,
        minutes: Math.floor(maxMinutes),
        wins: (winnerData?.economy?.mvpWins || 0) + 1,
        fresh: true
    });

    // 5. שליחה לדיסקורד
    const channel = client.channels.cache.get(MVP_CHANNEL_ID);
    if (channel) {
        await channel.send({
            content: `👑 **ה-MVP השבועי: <@${bestUser.id}>!**\nזכה ב-**₪${MVP_REWARD}** ושרף את השרת עם **${Math.floor(maxMinutes)}** דקות!`,
            files: [imagePath]
        });
    }

    // 6. שליחה לוואטסאפ (עם תיוג אם יש מספר מקושר)
    try {
        let whatsappMention = [];
        if (winnerData?.platforms?.whatsapp) {
            whatsappMention.push(winnerData.platforms.whatsapp);
        }

        const caption = `👑 **קבלו את ה-MVP השבועי: ${displayName}!**\nשרף השבוע את השרת עם ${Math.floor(maxMinutes)} דקות.\n\nתנו לו בכבוד 👇`;
        await sendToMainGroup(caption, whatsappMention, imagePath); // ✅ שימוש בפונקציה הקיימת
        
    } catch (e) {
        console.error('❌ Failed to send MVP to WhatsApp:', e);
    }

    // 7. עדכון סטטוס מערכת ואיפוס שבועי
    await statusRef.set({ lastAnnouncedDate: today }, { merge: true });
    
    // מחיקת הקולקשן השבועי (Reset)
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    log('🧹 טבלת weeklyStats אופסה בהצלחה.');
}

module.exports = { checkMVPStatusAndRun };