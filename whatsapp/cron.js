const cron = require('node-cron');
const db = require('../utils/firebase');
const admin = require('firebase-admin');
const { log } = require('../utils/logger');
const { updateDiscordCache } = require('./utils/discordCache');
const { generateProfileCard } = require('./handlers/profileRenderer');
const { OpenAI } = require('openai');
const fs = require('fs');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// משתנה לשמירת הפונקציה לשליחת הודעות
let sendToMainGroupFn;

function startWhatsAppSchedulers(discordClient, sendToMainGroup) {
    log('[Cron] ⏳ Starting WhatsApp schedulers...');
    
    // שמירת הפונקציה לשימוש במשימות
    sendToMainGroupFn = sendToMainGroup;

    // 1. עדכון Cache דיסקורד כל 15 דקות
    cron.schedule('*/15 * * * *', async () => {
        await updateDiscordCache(discordClient);
    });

    // 2. סיכום שבועי + MVP (כל מוצ"ש ב-21:00)
    cron.schedule('0 21 * * 6', async () => {
        log('[Cron] 🏆 Starting Weekly MVP calculation...');
        await announceWeeklyMVP();
    });

    // 3. איפוס מכסות יומיות
    cron.schedule('0 0 * * *', async () => {
        try {
            const snapshot = await db.collection('whatsapp_users').get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { dailyVoiceCount: 0 });
            });
            await batch.commit();
            log('[Cron] 🔄 Daily voice quotas reset.');
        } catch (e) {
            log(`[Cron] ❌ Error resetting quotas: ${e.message}`);
        }
    });
}

async function announceWeeklyMVP() {
    try {
        if (!sendToMainGroupFn) {
            log('[Cron] ❌ Error: sendToMainGroup function not available.');
            return;
        }

        const snapshot = await db.collection('users').orderBy('xp', 'desc').limit(1).get();
        if (snapshot.empty) return;

        const winnerDoc = snapshot.docs[0];
        const winnerData = winnerDoc.data();
        const winnerId = winnerDoc.id;
        const winnerName = winnerData.displayName || winnerData.username || "Unknown Soldier";

        const REWARD_AMOUNT = 1000;
        await db.collection('users').doc(winnerId).update({
            xp: admin.firestore.FieldValue.increment(REWARD_AMOUNT)
        });

        const cardPath = await generateProfileCard({
            name: winnerName,
            avatarUrl: winnerData.avatarUrl,
            messageCount: winnerData.totalMessages || 0,
            balance: (winnerData.xp || 0) + REWARD_AMOUNT
        });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: `אתה שמעון. ${winnerName} זכה ב-MVP השבועי וקיבל 1000 שקל. תפרגן לו, אבל תזהיר אותו שלא יבזבז את זה על שטויות.`
            }]
        });
        
        const shimonMsg = completion.choices[0].message.content;

        const caption = `🏆 **ה-MVP השבועי: ${winnerName}**\n` +
                        `💰 זכייה: **₪${REWARD_AMOUNT}**\n\n` +
                        `🎤 שמעון: "${shimonMsg}"`;

        await sendToMainGroupFn(caption, [], cardPath);

        try { fs.unlinkSync(cardPath); } catch (e) {}

    } catch (error) {
        log(`[Cron] ❌ MVP Error: ${error.message}`);
    }
}

module.exports = { startWhatsAppCron: startWhatsAppSchedulers };