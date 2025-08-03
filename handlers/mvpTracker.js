// 📁 handlers/mvpTracker.js
const admin = require('firebase-admin');
const { renderMvpImage } = require('./mvpRenderer');
const { log } = require('../utils/logger');
// ✅ ייבוא ישיר של DB
const db = require('../utils/firebase'); 

const Timestamp = admin.firestore.Timestamp;
const MVP_ROLE_ID = process.env.ROLE_MVP_ID;
const MVP_CHANNEL_ID = '583575179880431616';

let lastPrintedDate = null;

/**
 * מחשב ומכריז על ה-MVP השבועי.
 * @param {import('discord.js').Client} client 
 * @param {boolean} [force=false] 
 */
async function calculateAndAnnounceMVP(client, force = false) {
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const today = now.toISOString().split('T')[0];
    const statusRef = db.doc('mvpSystem/status');
    const statusSnap = await statusRef.get();
    const statusData = statusSnap.exists ? statusSnap.data() : null;

    if (!force && statusData?.lastAnnouncedDate === today) {
        log(`⛔ MVP כבר הוכרז היום (${today}) – מתעלם`);
        return;
    }

    const statsRef = db.collection('weeklyStats');
    const statsSnap = await statsRef.get();
    if (statsSnap.empty) {
        log('⚠️ אין weeklyStats – לא ניתן לחשב MVP');
        return;
    }

    let topUser = null, maxScore = 0;

    for (const doc of statsSnap.docs) {
        const data = doc.data();
        const score = data.xpThisWeek || 0;

        if (score > maxScore) {
            maxScore = score;
            topUser = {
                id: doc.id,
                score,
                voice: data.voiceMinutes || 0,
                xp: score
            };
        }
    }

    if (!topUser) return log(`⚠️ לא נמצא מועמד ראוי ל־MVP`);

    const guild = client.guilds.cache.first();
    if (!guild) {
        log('❌ לא נמצא שרת שהבוט נמצא בו.');
        return;
    }

    const member = await guild.members.fetch(topUser.id).catch(() => null);
    if (!member) return;

    const mvpRole = guild.roles.cache.get(MVP_ROLE_ID);
    if (!mvpRole) return log(`❌ תפקיד MVP לא נמצא (ID: ${MVP_ROLE_ID})`);

    try {
        const allMembers = await guild.members.fetch({ force: true }); // הוספת force למניעת שגיאות
        allMembers.forEach(m => {
            if (m.roles.cache.has(mvpRole.id)) {
                m.roles.remove(mvpRole).catch(err => log(`⚠️ שגיאה בהסרת תפקיד MVP מ־${m.user.tag}: ${err.message}`));
            }
        });
    } catch (err) {
        log(`⚠️ שגיאה בטעינת משתמשים (להסרת תפקיד MVP): ${err.message}`);
    }

    await member.roles.add(mvpRole).catch(err => log(`❌ שגיאה בהענקת תפקיד MVP ל־${member.user.tag}: ${err.message}`));

    const mvpStatsRef = db.doc(`mvpStats/${topUser.id}`);
    const mvpStatsSnap = await mvpStatsRef.get();
    const wins = mvpStatsSnap.exists ? (mvpStatsSnap.data().wins || 0) + 1 : 1;
    await mvpStatsRef.set({ wins }, { merge: true });

    const imagePath = await renderMvpImage({
        username: member.displayName || member.user.username,
        avatarURL: member.displayAvatarURL({ extension: 'png', size: 512 }),
        minutes: topUser.voice,
        wins,
        fresh: true
    }).catch(err => {
        log(`❌ שגיאה ביצירת תמונת MVP: ${err.message}`);
        return null;
    });

    if (!imagePath) return;

    const channel = client.channels.cache.get(MVP_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return log(`❌ ערוץ MVP לא נמצא או אינו ערוץ טקסט (ID: ${MVP_CHANNEL_ID})`);

    if (statusData?.messageId && statusData?.channelId) {
        const oldChannel = client.channels.cache.get(statusData.channelId);
        const oldMessage = await oldChannel?.messages?.fetch(statusData.messageId).catch(() => null);
        if (oldMessage) {
            await oldMessage.delete().catch(err => log(`⚠️ שגיאה במחיקת הודעת MVP ישנה: ${err.message}`));
        }
    }

    const message = await channel.send({ content: '@everyone', files: [imagePath] }).catch(() => null);
    if (!message) return;

    await message.react('🏅').catch(err => log(`⚠️ שגיאה בהוספת ריאקציה להודעת MVP: ${err.message}`));

    await statusRef.set({
        lastCalculated: Timestamp.now(),
        lastAnnouncedDate: today,
        messageId: message.id,
        channelId: message.channel.id,
        reacted: false
    }, { merge: true });

    for (const doc of statsSnap.docs) {
        await db.doc(`weeklyStats/${doc.id}`).delete().catch(err => log(`⚠️ שגיאה במחיקת weeklyStats עבור ${doc.id}: ${err.message}`));
    }

    log(`🏆 MVP: ${member.user.username} (${topUser.voice} דקות, ${topUser.xp} XP, ${wins} זכיות)`);
}

/**
 * בודק את סטטוס ה-MVP ומפעיל את החישוב וההכרזה אם זה יום ראשון ולא הוכרז עדיין.
 * @param {import('discord.js').Client} client 
 */
async function checkMVPStatusAndRun(client) { // --- ✅ התיקון: הסרת הפרמטר 'db' ---
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const today = now.toISOString().split('T')[0];
    const day = now.getDay();

    if (day !== 0) return;

    const statusSnap = await db.doc('mvpSystem/status').get(); // --- ✅ שימוש ב-db המיובא ---
    const lastDate = statusSnap.exists ? statusSnap.data()?.lastAnnouncedDate : null;

    if (lastDate === today) {
        if (lastPrintedDate !== today) {
            lastPrintedDate = today;
            log(`⏱️ MVP כבר פורסם היום`);
        }
        return;
    }

    log(`📢 יום ראשון – מחשב MVP...`);
    lastPrintedDate = today;

    await calculateAndAnnounceMVP(client, false); // --- ✅ קריאה עם הפרמטרים הנכונים ---
}

/**
 * מעדכן את דקות הפעילות הקולית של משתמש ב-Firebase.
 * @param {string} userId 
 * @param {number} minutes 
 */
async function updateVoiceActivity(userId, minutes) { // --- ✅ התיקון: הסרת הפרמטר 'db' ---
    const ref = db.collection('voiceLifetime').doc(userId); // --- ✅ שימוש ב-db המיובא ---
    const doc = await ref.get();
    const current = doc.exists ? doc.data().total || 0 : 0;
    await ref.set({
        total: current + minutes,
        lastUpdated: Date.now()
    }, { merge: true });
}

module.exports = {
    calculateAndAnnounceMVP,
    checkMVPStatusAndRun,
    updateVoiceActivity,
};