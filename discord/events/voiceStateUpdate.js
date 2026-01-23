// 📁 discord/events/voiceStateUpdate.js
const { Events } = require('discord.js');
const { log } = require('../../utils/logger');

// --- המערכות החדשות (במקום statTracker הישן) ---
const logistics = require('../../handlers/voice/logistics');      // ניהול חדרים וכרוז
const podcastManager = require('../../handlers/voice/podcast');   // פודקאסט AI
const voiceBridge = require('./voiceBridge');                     // גשר לוואטסאפ
const gameStats = require('../../handlers/users/stats');          // ✅ הסטטיסטיקות החדשות (מה ששלחת)
const xpManager = require('../../handlers/economy/xpManager');    // ✅ מנהל ה-XP
const userManager = require('../../handlers/users/manager');      // ✅ מנהל המשתמשים (זמן פעילות)
const mvpManager = require('../../handlers/voice/mvp_manager');   // ✅ מנהל ה-MVP החדש

// מפה למעקב זמני כניסה
const joinTimestamps = new Map();

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const userId = member.id;
        const oldChannel = oldState.channel;
        const newChannel = newState.channel;
        const now = Date.now();

        try {
            // 1. לוגיסטיקה (מונה חדרים + כרוז BF6)
            if (newState.guild) {
                await logistics.updateVoiceIndicator(newState.guild);
            }

            // 2. פודקאסט AI
            if (podcastManager && podcastManager.handleVoiceStateUpdate) {
                await podcastManager.handleVoiceStateUpdate(oldState, newState);
            }

            // 3. גשר לוואטסאפ
            if (voiceBridge && voiceBridge.handleVoiceStateUpdate) {
                await voiceBridge.handleVoiceStateUpdate(oldState, newState);
            }

            // --- כניסה לערוץ (Join) ---
            if (newChannel && !oldChannel) {
                joinTimestamps.set(userId, now);

                // עדכון "נראה לאחרונה" כבר בכניסה
                await userManager.updateLastActive(userId);

                // כרוז BF6 (רק בכניסה/מעבר לחדר הספציפי)
                await logistics.handleBF6Announcer(member, newChannel.id);

                // 👑 כרוז MVP (לכל חדר)
                await mvpManager.handleEntrance(member, newChannel.id);
            }
            // טיפול במעבר ערוץ (לצורך BF6)
            else if (newChannel && oldChannel && newChannel.id !== oldChannel.id) {
                await logistics.handleBF6Announcer(member, newChannel.id);
                // 👑 כרוז MVP (גם במעבר חדר)
                await mvpManager.handleEntrance(member, newChannel.id);
            }

            // --- יציאה מערוץ (Leave) ---
            if (oldChannel && !newChannel) {
                // Cancel MVP Timer if they leave
                await mvpManager.handleExit(member);

                const joinedAt = joinTimestamps.get(userId);

                if (joinedAt) {
                    const durationMs = now - joinedAt;

                    // חישובים רק אם היה מחובר מעל דקה
                    if (durationMs > 60000) {
                        const minutes = Math.round(durationMs / 60000);

                        log(`⏱️ [Voice] ${member.displayName} היה מחובר ${minutes} דקות.`);

                        // א. מתן XP על זמן שיחה
                        if (xpManager.addVoiceXP) {
                            await xpManager.addVoiceXP(userId, minutes);
                        }

                        // ב. עדכון זמן Voice כללי בפרופיל
                        if (userManager.addVoiceMinutes) {
                            await userManager.addVoiceMinutes(userId, minutes);
                        }

                        // ג. עדכון סטטיסטיקות משחק (הקובץ ששלחת!)
                        // בודקים אם המשתמש שיחק במשהו בזמן הזה
                        const activity = member.presence?.activities?.find(a => a.type === 0); // 0 = Playing
                        if (activity && activity.name) {
                            log(`🎮 [GameStats] מעדכן ${minutes} דקות על ${activity.name}`);
                            await gameStats.updateGameStats(userId, activity.name, minutes);
                        }
                    }

                    // ניקוי הטיימר
                    joinTimestamps.delete(userId);
                }

                // עדכון מונה חדרים ביציאה
                await logistics.updateVoiceIndicator(oldState.guild);
            }

        } catch (error) {
            // log(`❌ [VoiceStateUpdate] Error: ${error.message}`);
            console.error(error);
        }
    }
};