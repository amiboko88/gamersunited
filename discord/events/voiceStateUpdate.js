const { Events } = require('discord.js');
const { log } = require('../../utils/logger');

// --- המערכות החדשות ---
const logistics = require('../../handlers/voice/logistics');
const podcastManager = require('../../handlers/voice/podcast');
const voiceBridge = require('./voiceBridge');
const gameStats = require('../../handlers/users/stats');
const xpManager = require('../../handlers/economy/xpManager');
const userManager = require('../../handlers/users/manager');
const mvpManager = require('../../handlers/voice/mvp_manager');

// 💾 CONTINUOUS SAVING (Crash Protection)
// Map Stores: { userId: startTime }
const joinTimestamps = new Map();

// Save every 5 minutes (300,000ms)
// This prevents data loss if bot restarts mid-session.
setInterval(async () => {
    if (joinTimestamps.size === 0) return;

    // log(`💾 [Voice] Periodic Save for ${joinTimestamps.size} active users...`);
    const now = Date.now();
    const SnapshotOps = [];

    for (const [userId, startTime] of joinTimestamps.entries()) {
        const durationMs = now - startTime;
        if (durationMs > 60000) { // Only save if > 1 minute pending
            const minutes = Math.round(durationMs / 60000);

            // We adding the minutes accrued SO FAR
            // Then we reset the startTime to NOW.

            // 1. Add to DB Path
            if (userManager.addVoiceMinutes) {
                SnapshotOps.push(userManager.addVoiceMinutes(userId, minutes));
            }

            // 2. Add XP
            if (xpManager.addVoiceXP) {
                SnapshotOps.push(xpManager.addVoiceXP(userId, minutes));
            }

            // Reset timer to avoid double counting on next interval or leave
            joinTimestamps.set(userId, now);
        }
    }

    // Execute all save promises in parallel (fire and forget mostly, but we await to confirm)
    await Promise.allSettled(SnapshotOps);
    // log(`✅ [Voice] Periodic Save Complete.`);

}, 5 * 60 * 1000); // 5 Minutes

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

                // 🌅 End of Session Detection (The "Good Night" Protocol)
                // If the channel is now EMPTY, check if we should generate a Summary Card.
                if (oldChannel.members.size === 0 && oldChannel.id !== oldState.guild.afkChannelId) {
                    const sessionManager = require('../../handlers/gamers/session_manager');
                    // We fire this asynchronously to not block the event loop
                    sessionManager.handleSessionEnd(oldState.guild, oldChannel).catch(e => console.error(e));
                }
            }

        } catch (error) {
            // log(`❌ [VoiceStateUpdate] Error: ${error.message}`);
            console.error(error);
        }
    },

    // 🆕 Restore Sessions on Bot Restart
    async restoreSessions(client) {
        if (!client.isReady()) return;

        let restoredCount = 0;
        const now = Date.now();

        client.guilds.cache.forEach(guild => {
            guild.voiceStates.cache.forEach(voiceState => {
                if (voiceState.member && !voiceState.member.user.bot && voiceState.channelId) {
                    // Check if already tracking (safety)
                    if (!joinTimestamps.has(voiceState.id)) {
                        joinTimestamps.set(voiceState.id, now);
                        restoredCount++;
                    }
                }
            });
        });

        if (restoredCount > 0) {
            log(`🔄 [Voice] Restored tracking for ${restoredCount} active users.`);
        }
    }
};