// 📁 discord/events/voiceStateUpdate.js
const logistics = require('../../handlers/voice/logistics');
const voiceBridge = require('./voiceBridge'); // הגשר לוואטסאפ
const statTracker = require('../../handlers/statTracker'); // סטטיסטיקות
const { getUserRef } = require('../../utils/userUtils');
const ttsTester = require('../../handlers/ttsTester'); // לבקשתך - נשמר
const podcastManager = require('../../handlers/podcastManager'); // לבקשתך - נשמר

// מפה למעקב אחרי זמני כניסה (לחישוב XP וזמן שהייה)
const joinTimestamps = new Map();
const TTS_TEST_CHANNEL_ID = '1396779274173943828';

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const userId = member.id;
        const oldChannel = oldState.channel;
        const newChannel = newState.channel;
        const now = Date.now();

        try {
            // 1. עדכון מונה המשתמשים (לוגיסטיקה)
            await logistics.updateCounter(newState.client);

            // 2. טיפול ב-Bridge לוואטסאפ (הודעה לקבוצה)
            await voiceBridge.handleVoiceStateUpdate(oldState, newState);

            // 3. ניהול Podcast (אם פעיל)
            await podcastManager.handleVoiceStateUpdate(oldState, newState);

            // --- כניסה לערוץ / מעבר ---
            if (newChannel) {
                // שמירת זמן כניסה לסטטיסטיקה
                if (!oldChannel) {
                    joinTimestamps.set(userId, now);
                    await statTracker.trackVoiceJoin(userId);
                    await statTracker.trackActiveHour(userId); // מעקב שעות שיא
                }
                
                // בדיקת FIFO
                await logistics.handleFIFO(member, newChannel.id);
                
                // בדיקת BF6 (רק במעבר או כניסה ראשונית)
                if (!oldChannel || oldChannel.id !== newChannel.id) {
                    await logistics.handleBF6Announcer(member, newChannel.id);
                }

                // בדיקת TTS Tester
                if (newChannel.id === TTS_TEST_CHANNEL_ID && oldChannel?.id !== TTS_TEST_CHANNEL_ID) {
                    await ttsTester.runTTSTest(member);
                }
            }

            // --- יציאה מערוץ (או ניתוק) ---
            if (oldChannel && !newChannel) {
                // הסרת רול FIFO
                await logistics.handleFIFO(member, null);

                // חישוב זמן ו-XP
                const joinedAt = joinTimestamps.get(userId);
                if (joinedAt) {
                    const durationMs = now - joinedAt;
                    // רק אם היה מעל דקה
                    if (durationMs > 60000) {
                        const minutes = Math.round(durationMs / 60000);
                        
                        await statTracker.trackVoiceMinute(userId, minutes);
                        await statTracker.trackJoinDuration(userId, minutes);

                        // עדכון סטטיסטיקת משחק (Game Stats)
                        const activity = member.presence?.activities?.find(a => a.type === 0);
                        if (activity) {
                            await statTracker.updateGameStats(userId, activity.name, minutes);
                        }

                        // עדכון זמן פעילות אחרון ב-DB
                        const userRef = await getUserRef(userId, 'discord');
                        await userRef.set({ meta: { lastSeen: new Date().toISOString() } }, { merge: true });
                    }
                    joinTimestamps.delete(userId);
                }
            }

        } catch (error) {
            console.error('❌ [VoiceEvent] Error:', error);
        }
    }
};