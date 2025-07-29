// 📁 handlers/podcastManager.js

const { log } = require('../utils/logger');
const { synthesizeTTS } = require('./tts/ttsEngine.elevenlabs.js'); // עכשיו קורא למנוע גוגל
const { addToQueue } = require('./voiceQueue');
const { getPodcastScript } = require('../utils/scriptGenerator');

// כל הפונקציות והמשתנים הגלובליים שלך נשמרו
let podcastMonitoringEnabled = false;
const recentlyTriggered = new Set();
const userCooldown = 60000;

function setPodcastMonitoring(enabled) {
    podcastMonitoringEnabled = enabled;
    log(`[PODCAST] ניטור הפודקאסטים הוגדר ל: ${enabled}`);
}

function initializePodcastState() {
    log('[PODCAST] מאתחל מצב פודקאסט...');
    setPodcastMonitoring(false);
}

// הפונקציה המרכזית שלך - עכשיו עם בחירת פרופילים דינמית
async function handlePodcastTrigger(newState) {
    if (!podcastMonitoringEnabled || !newState.channel) return;

    const member = newState.member;
    const channel = newState.channel;

    if (recentlyTriggered.has(member.id)) return;
    
    recentlyTriggered.add(member.id);
    setTimeout(() => recentlyTriggered.delete(member.id), userCooldown);

    log(`[PODCAST] מפעיל פודקאסט עבור ${member.displayName} בערוץ ${channel.name}`);

    try {
        // --- לא נגעתי בלוגיקה הזו בכלל ---
        const { script, participants } = await getPodcastScript(member, channel);
        if (!script || script.length === 0) {
            log('[PODCAST] לא נוצר סקריפט (כנראה פחות מ-4 משתתפים), מדלג.');
            return;
        }
        // ------------------------------------

        log(`[PODCAST] נוצר סקריפט עם ${script.length} שורות.`);

        for (const line of script) {
            // --- ✨ החלק החדש: בחירת פרופיל דיבור חכם ---
            let profile;
            if (line.speaker === 'שמעון') {
                const profiles = ['shimon_calm', 'shimon_energetic', 'shimon_serious'];
                profile = profiles[Math.floor(Math.random() * profiles.length)];
            } else { // 'שירלי'
                const profiles = ['shirly_calm', 'shirly_happy', 'shirly_dramatic'];
                profile = profiles[Math.floor(Math.random() * profiles.length)];
            }

            const audioBuffer = await synthesizeTTS(line.text, profile);
            addToQueue(channel.guild.id, channel.id, audioBuffer, channel.client); // מעביר את ה-client
        }
        
    } catch (error) {
        log.error('❌ [PODCAST] שגיאה ביצירת או הוספת הפודקאסט לתור:', error);
    }
}

// כל שאר הפונקציות המקוריות שלך נשמרות כאן אם היו כאלה.
// הקוד שהצגת לא הכיל פונקציות נוספות, אבל אם היו, הן היו נשארות.

module.exports = {
    setPodcastMonitoring,
    initializePodcastState,
    handlePodcastTrigger,
};