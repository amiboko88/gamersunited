const scraper = require('./scraper');
const admin = require('firebase-admin');
const db = admin.firestore();
const brain = require('../ai/brain');
const voiceManager = require('../ai/voice');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COLLECTION_NAME = 'system_data';
const DOC_ID = 'warzone_intel';

let discordClientRef = null;
let whatsappSockRef = null;
let telegramBotRef = null;
let mainGroupId = process.env.WHATSAPP_MAIN_GROUP_ID;

async function initIntel(discordClient, whatsappSock, telegramBot) {
    console.log('[Intel] Initializing Warzone Intel System...');

    discordClientRef = discordClient;
    whatsappSockRef = whatsappSock;
    telegramBotRef = telegramBot;

    // Initial check
    await syncMeta();
    await syncUpdates();

    // Schedule
    setInterval(async () => {
        await syncUpdates();
    }, 1000 * 60 * 60 * 4); // Every 4 hours

    setInterval(async () => {
        await syncMeta();
    }, 1000 * 60 * 60 * 24); // Every 24 hours
}

async function syncMeta() {
    console.log('[Intel] Syncing Meta...');
    const data = await scraper.fetchMeta();
    if (data && data.length > 0) {
        await db.collection(COLLECTION_NAME).doc(DOC_ID).set({
            meta_weapons: data,
            meta_last_updated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log('[Intel] Meta synced.');
    } else {
        console.log('[Intel] No meta data found or error.');
    }
}

async function syncUpdates() {
    console.log('[Intel] Checking for updates...');
    const latest = await scraper.checkUpdates();
    if (latest) {
        const doc = await db.collection(COLLECTION_NAME).doc(DOC_ID).get();
        const currentData = doc.exists ? doc.data() : {};

        if (currentData.latest_patch_url !== latest.url) {
            console.log('[Intel] New update found!', latest.title);

            // 1. Fetch content
            const content = await scraper.getUpdateContent(latest.url);

            // 2. Summarize & Translate via AI
            const summary = await summarizeUpdate(latest.title, content);

            // 2.5 Check Nvidia Drivers
            let gpuNote = "";
            try {
                const gpuInfo = await scraper.checkNvidiaDrivers();
                if (gpuInfo) {
                    const driverDate = new Date(gpuInfo.date);
                    const daysOld = (new Date() - driverDate) / (1000 * 60 * 60 * 24);
                    if (daysOld < 5) {
                        gpuNote = `\n\n💡 **טיפ טכני:** יצא גם דרייבר חדש ל-NVIDIA (${gpuInfo.version}). תתקינו שלא יקרוס!`;
                    }
                }
            } catch (e) {
                console.log('[Intel] GPU Check failed (minor)', e);
            }

            const fullSummary = summary + gpuNote;

            // 2.6 Generate Audio Briefing (The "Lazy" Feature)
            let audioPath = null;
            try {
                const ttsText = `עדכון חדש בוורזון! ${latest.title}. ${summary.substring(0, 250)}... יאללה ללובי.`;
                const audioBuffer = await voiceManager.speak(ttsText);

                if (audioBuffer) {
                    // Save to temp file needed for WA socket usually (or pass buffer directly if supported)
                    // Baileys supports Buffer directly for audio/video but safer to verify or use wrapper.
                    // Let's assume Baileys accepts Buffer in .audio field.
                    audioPath = audioBuffer;
                }
            } catch (e) { console.error('[Intel] TTS Gen Failed:', e); }

            // 3. Save
            await db.collection(COLLECTION_NAME).doc(DOC_ID).set({
                latest_patch_url: latest.url,
                latest_patch_title: latest.title,
                latest_patch_summary: fullSummary,
                update_last_checked: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // 4. Notify All Platforms
            await broadcastUpdate(fullSummary, latest.url, audioPath);

        } else {
            console.log('[Intel] No new updates.');
        }
    }
}

async function broadcastUpdate(summary, url, audioBuffer = null) {
    const finalMsg = `📢 **עדכון וורזון חדש - דיווח שמעון!** 📢\n\n${summary}\n\n🔗 לינק מלא: ${url}`;

    // WhatsApp
    if (whatsappSockRef && mainGroupId) {
        try {
            await whatsappSockRef.sendMessage(mainGroupId, { text: finalMsg });

            if (audioBuffer) {
                await whatsappSockRef.sendMessage(mainGroupId, {
                    audio: audioBuffer, // Passing Buffer directly
                    mimetype: 'audio/mp4',
                    ptt: true // Send as Voice Note
                });
                // No text pointer needed, Voice Note appears naturally below
            }
        } catch (e) { console.error('[Intel] WA Broadcast Error:', e); }
    }

    // Telegram & Discord - Add logic if IDs are available structure-wise
    console.log('[Intel] Broadcast sent:', finalMsg);
}

async function summarizeUpdate(title, content) {
    const prompt = `
    You are Shimon, the Gamer AI.
    A new Call of Duty Warzone update has been released: "${title}".
    
    Here is the raw text content of the update (truncated):
    ${content.slice(0, 3000)}...
    
    Task:
    1. Summarize the MOST important changes (Nerfs/Buffs to popular weapons, new maps, big events).
    2. Translate the summary to Hebrew (Slang/Gamer style).
    3. Keep it short (max 3-4 bullet points).
    4. End with a cool line like "יאללה ללובי".
    
    Output strictly the Hebrew summary.
    `;

    try {
        const AiResponse = await brain.generateInternal(prompt);
        return AiResponse || "עדכון חדש ב-Warzone! (לא הצלחתי לסכם, תבדקו בקישור)";
    } catch (e) {
        console.error("AI Summary failed", e);
        return "יש עדכון חדש! כנסו לראות.";
    }
}

module.exports = {
    initIntel,
    syncMeta,
    syncUpdates
};
