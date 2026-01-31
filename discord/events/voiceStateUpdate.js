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
// Map Stores: { userId: { sessionStart: number, lastCheckpoint: number } }
const joinTimestamps = new Map();

// Save every 5 minutes (300,000ms)
// This prevents data loss if bot restarts mid-session.
setInterval(async () => {
    if (joinTimestamps.size === 0) return;

    const now = Date.now();
    const SnapshotOps = [];

    for (const [userId, data] of joinTimestamps.entries()) {
        const { lastCheckpoint } = data;
        const durationMs = now - lastCheckpoint;

        if (durationMs > 60000) { // Only save if > 1 minute accrued since last save
            const minutes = Math.round(durationMs / 60000);

            // 1. Add to DB Path
            if (userManager.addVoiceMinutes) {
                SnapshotOps.push(userManager.addVoiceMinutes(userId, minutes));
            }

            // 2. Add XP
            if (xpManager.addVoiceXP) {
                SnapshotOps.push(xpManager.addVoiceXP(userId, minutes));
            }

            // Update checkpoint to NOW (so we don't double count these minutes)
            data.lastCheckpoint = now;
            joinTimestamps.set(userId, data);
        }
    }

    // Execute all save promises in parallel
    await Promise.allSettled(SnapshotOps);

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
                // Init Session
                joinTimestamps.set(userId, { sessionStart: now, lastCheckpoint: now });

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

                const sessionData = joinTimestamps.get(userId);

                if (sessionData) {
                    const { sessionStart, lastCheckpoint } = sessionData;

                    // A. Total Session Time (For Logs)
                    const totalDurationMs = now - sessionStart;
                    const totalMinutes = Math.round(totalDurationMs / 60000);

                    // B. Final Increment (For DB) - Time since last checkpoint
                    const finalChunkMs = now - lastCheckpoint;
                    const finalChunkMinutes = Math.round(finalChunkMs / 60000);

                    // חישובים רק אם היה מחובר מעל דקה בסה"כ
                    if (totalMinutes >= 1) {
                        log(`⏱️ [Voice] ${member.displayName} היה מחובר ${totalMinutes} דקות.`);

                        // א. מתן XP על זמן שיחה (השארית)
                        if (xpManager.addVoiceXP && finalChunkMinutes > 0) {
                            await xpManager.addVoiceXP(userId, finalChunkMinutes);
                        }

                        // ב. עדכון זמן Voice כללי בפרופיל (השארית)
                        if (userManager.addVoiceMinutes && finalChunkMinutes > 0) {
                            await userManager.addVoiceMinutes(userId, finalChunkMinutes);
                        }

                        // ג. עדכון סטטיסטיקות משחק
                        // כאן נרצה לעדכן את המשתמש בכמות דקות המדויקת של הסשן *המשחקי* הנוכחי?
                        // אם הוא שיחק כל הסשן - אנחנו רוצים לשמור את ה-CHUNK הסופי.
                        // GameStats שומר מצטבר, אז שולחים לו את ה-CHUNK.
                        const activity = member.presence?.activities?.find(a => a.type === 0); // 0 = Playing
                        if (activity && activity.name && finalChunkMinutes > 0) {
                            log(`🎮 [GameStats] מעדכן ${finalChunkMinutes} דקות (סופי) על ${activity.name}`);
                            await gameStats.updateGameStats(userId, activity.name, finalChunkMinutes);
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
                        joinTimestamps.set(voiceState.id, { sessionStart: now, lastCheckpoint: now });
                        restoredCount++;

                        // 👑 Startup Check: If MVP is receiving us, acknowledge him!
                        // This handles the case where bot restarts while MVP is already holding court.
                        const mvpManager = require('../../handlers/voice/mvp_manager');
                        mvpManager.handleEntrance(voiceState.member, voiceState.channelId).catch(console.error);
                    }
                }
            });
        });

        if (restoredCount > 0) {
            log(`🔄 [Voice] Restored tracking for ${restoredCount} active users.`);
        }
    }
};