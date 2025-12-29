const admin = require('firebase-admin');
const { renderMvpImage } = require('./mvpRenderer');
const { log } = require('../utils/logger');
const db = require('../utils/firebase'); 
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
// ✅ ייבוא הפונקציה לשליחה לוואטסאפ (וודא שהנתיב נכון, הנחתי שזה תיקייה אחת למעלה ואז whatsapp)
const { sendToMainGroup } = require('../whatsapp/index');

const MVP_ROLE_ID = process.env.ROLE_MVP_ID;
const MVP_CHANNEL_ID = '583575179880431616';

let lastPrintedDate = null;

async function checkMVPStatusAndRun(client) {
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const today = now.toISOString().split('T')[0];
    const day = now.getDay(); // 0 = ראשון

    if (day !== 0) return;

    const statusRef = db.doc('mvpSystem/status');
    const statusSnap = await statusRef.get();
    const statusData = statusSnap.exists ? statusSnap.data() : null;

    if (statusData?.lastAnnouncedDate === today) {
        if (lastPrintedDate !== today) {
            lastPrintedDate = today;
            log(`⛔ MVP כבר הוכרז היום (${today}) – מתעלם`);
        }
        return;
    }

    log(`📢 יום ראשון – מחשב MVP...`);
    lastPrintedDate = today;

    await calculateAndAnnounceMVP(client, false);
}

async function calculateAndAnnounceMVP(client, force = false) {
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const today = now.toISOString().split('T')[0];
    const statusRef = db.doc('mvpSystem/status');
    
    // שליפת נתונים שבועיים
    const statsRef = db.collection('weeklyStats');
    const snapshot = await statsRef.get();
    
    if (snapshot.empty) {
        log('⚠️ אין נתונים שבועיים לחישוב MVP.');
        return;
    }

    let bestUser = null;
    let maxScore = -1;

    snapshot.forEach(doc => {
        const data = doc.data();
        const score = (data.voiceMinutes || 0) * 1 + (data.messagesSent || 0) * 0.5;
        if (score > maxScore) {
            maxScore = score;
            bestUser = { id: doc.id, ...data };
        }
    });

    if (!bestUser) return;

    const guild = client.guilds.cache.first();
    const member = await guild.members.fetch(bestUser.id).catch(() => null);
    const displayName = member ? member.displayName : 'Unknown Warrior';
    const avatarURL = member ? member.user.displayAvatarURL({ extension: 'png' }) : 'https://cdn.discordapp.com/embed/avatars/0.png';

    // יצירת תמונה
    const imagePath = await renderMvpImage({
        username: displayName,
        avatarURL,
        minutes: Math.floor(bestUser.voiceMinutes || 0),
        wins: bestUser.mvpWins || 0,
        fresh: true
    });

    // שליחה לדיסקורד
    const channel = guild.channels.cache.get(MVP_CHANNEL_ID);
    if (channel) {
        const file = new AttachmentBuilder(imagePath, { name: 'mvp.png' });
        const embed = new EmbedBuilder()
            .setTitle('👑 ה-MVP השבועי שלנו!')
            .setDescription(`קבלו את **${displayName}** שנתן בראש השבוע!`)
            .setColor('Gold')
            .setImage('attachment://mvp.png');
        
        await channel.send({ content: `👏 ברכות ל-${member || displayName}!`, embeds: [embed], files: [file] });
    }

    // הוספת ניצחון ואיפוס סטטיסטיקה
    await db.collection('userStats').doc(bestUser.id).set({
        mvpWins: admin.firestore.FieldValue.increment(1)
    }, { merge: true });

    if (member && MVP_ROLE_ID) {
        await member.roles.add(MVP_ROLE_ID).catch(console.error);
    }

    // שמירת סטטוס
    await statusRef.set({ lastAnnouncedDate: today }, { merge: true });

    // איפוס שבועי (מוחק את הקולקשן)
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    log('🧹 נתונים שבועיים אופסו.');

    // --- ✅ שליחה לוואטסאפ ---
    try {
        log('[MVP] 📲 Sending to WhatsApp...');
        
        // מציאת הטלפון של המנצח (אם מקושר)
        let whatsappMention = [];
        const userDoc = await db.collection('users').doc(bestUser.id).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.platforms?.whatsapp) {
                whatsappMention.push(userData.platforms.whatsapp);
            }
        }

        const caption = `👑 **קבלו את ה-MVP השבועי: ${displayName}!**\nשרף השבוע את השרת עם ${Math.floor(bestUser.voiceMinutes || 0)} דקות.\n\nתנו לו בכבוד 👇`;
        
        // שליחת התמונה והטקסט
        await sendToMainGroup(caption, whatsappMention, imagePath);
        
    } catch (e) {
        console.error('❌ Failed to send MVP to WhatsApp:', e);
    }
}

async function updateVoiceActivity(userId, minutes) {
    const weekRef = db.collection('weeklyStats').doc(userId);
    await weekRef.set({
        voiceMinutes: admin.firestore.FieldValue.increment(minutes)
    }, { merge: true });
}

async function updateMessageActivity(userId) {
    const weekRef = db.collection('weeklyStats').doc(userId);
    await weekRef.set({
        messagesSent: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
}

module.exports = { checkMVPStatusAndRun, calculateAndAnnounceMVP, updateVoiceActivity, updateMessageActivity };