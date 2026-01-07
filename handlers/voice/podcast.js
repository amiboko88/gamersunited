// 📁 handlers/voice/podcast.js
const { log } = require('../../utils/logger');
// שים לב: אנחנו עדיין משתמשים במנוע TTS הישן שנמצא בתיקייה tts/
// אל תמחק את תיקיית tts עדיין!
const ttsEngine = require('./openaiTTS'); // ✅ המנוע החדש שיושב לידו באותה תיקייה
const { getUserData } = require('../../utils/userUtils'); // DB מאוחד
const musicPlayer = require('../music/player'); // הנגן החדש

const MIN_USERS = 3;
const COOLDOWN = 30 * 60 * 1000; // 30 דקות בין פודקאסטים
let lastPodcastTime = 0;
let activeChannelId = null;

class PodcastManager {

    /**
     * בודק האם להפעיל פודקאסט כשיש תנועה בחדרים
     * (נקרא מתוך discord/events/voiceStateUpdate)
     */
    async handleVoiceStateUpdate(oldState, newState) {
        const channel = newState.channel;
        
        // אם הפודקאסט רץ ומישהו יצא - בודקים אם לעצור
        if (activeChannelId && oldState.channelId === activeChannelId) {
            const currentMembers = oldState.channel.members.filter(m => !m.user.bot).size;
            if (currentMembers < MIN_USERS) {
                log('[Podcast] אין מספיק קהל. עוצר את השידור.');
                musicPlayer.stop(oldState.guild.id);
                activeChannelId = null;
            }
            return;
        }

        // אם אין ערוץ חדש או שהפודקאסט כבר רץ - מתעלמים
        if (!channel || activeChannelId) return;

        // בדיקת קולדאון
        const now = Date.now();
        if (now - lastPodcastTime < COOLDOWN) return;

        // בדיקת כמות אנשים
        const humans = channel.members.filter(m => !m.user.bot);
        if (humans.size >= MIN_USERS) {
            log(`[Podcast] 🎙️ מתחיל פודקאסט בערוץ ${channel.name}`);
            lastPodcastTime = now;
            activeChannelId = channel.id;

            // בחירת קורבן (רנדומלי)
            const victim = humans.random();
            await this.playPersonalPodcast(channel, victim);
        }
    }

    async playPersonalPodcast(voiceChannel, member) {
        try {
            const userName = member.displayName;
            const userData = await getUserData(member.id, 'discord');
            
            // שליפת ירידות מה-DB
            let roasts = userData?.brain?.roasts || [];
            if (roasts.length === 0) {
                roasts = [
                    `שמעת ש-${userName} נכנס? ה-IQ בחדר צנח.`, 
                    `תגיד, ${userName} משחק או רק נושם במיקרופון?`,
                    `יאללה ${userName}, תראה לנו מה אתה יודע חוץ מלהפסיד.`
                ];
            }

            // יצירת תסריט פשוט
            const script = [
                { speaker: 'shimon', text: `ערב טוב מאזינים, כאן רדיו שמעון בשידור חי.` },
                { speaker: 'shirly', text: `וואי וואי, תראה מי נכנס. זה ${userName}.` },
                { speaker: 'shimon', text: roasts[Math.floor(Math.random() * roasts.length)] },
                { speaker: 'shimon', text: `יאללה, תהנו יא בוטים. שירלי, תני בראש.` }
            ];

            // יצירת אודיו (משתמש במנוע הקיים)
            const audioFiles = await ttsEngine.synthesizeConversation(script, member);

            // הוספה לתור בנגן החדש
            for (const file of audioFiles) {
                await musicPlayer.addToQueue(
                    voiceChannel.guild.id, 
                    voiceChannel.id, 
                    file, 
                    member.client, 
                    'PODCAST'
                );
            }

            // איפוס מזהה הערוץ הפעיל אחרי זמן סביר (למשל דקה)
            setTimeout(() => { activeChannelId = null; }, 60000);

        } catch (error) {
            log(`❌ Podcast Error: ${error.message}`);
            activeChannelId = null;
        }
    }
}

module.exports = new PodcastManager();