// 📁 handlers/voice/podcast.js
const { log } = require('../../utils/logger');
// const ttsEngine = require('./openaiTTS'); // ❌ הוסר - משתמשים ב-ElevenLabs דרך ai/voice.js
const { getUserData } = require('../../utils/userUtils');
const audioManager = require('../audio/manager');
const { OpenAI } = require('openai'); // ✅ הוספת OpenAI לגנרציית תסריט

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MIN_USERS = 3;
const COOLDOWN = 30 * 60 * 1000;
let lastPodcastTime = 0;
let activeChannelId = null;

class PodcastManager {

    async handleVoiceStateUpdate(oldState, newState) {
        const channel = newState.channel;

        if (activeChannelId && oldState.channelId === activeChannelId) {
            const currentMembers = oldState.channel.members.filter(m => !m.user.bot).size;
            if (currentMembers < MIN_USERS) {
                log('[Podcast] אין מספיק קהל. עוצר.');
                if (audioManager.stop) audioManager.stop(oldState.guild.id);
                activeChannelId = null;
            }
            return;
        }

        if (!channel || activeChannelId) return;

        // 🚨 ערוץ טסטים סודי (עוקף את כל ההגבלות)
        const TEST_CHANNEL_ID = '1396779274173943828';
        const isTestMode = channel.id === TEST_CHANNEL_ID;

        const now = Date.now();
        if (!isTestMode && now - lastPodcastTime < COOLDOWN) return;

        const humans = Array.from(channel.members.filter(m => !m.user.bot).values());

        // בטסטים מספיק בן אדם אחד, רגיל צריך 3
        const requiredUsers = isTestMode ? 1 : MIN_USERS;

        if (humans.length >= requiredUsers) {
            log(`[Podcast] זיהיתי התקהלות... ממתין לכרוז (Stabilizing)...`);

            // השהיה קצרה כדי לתת לכרוז לסיים או להתייצב
            setTimeout(async () => {
                // בדיקה חוזרת: האם כולם עדיין שם?
                const currentChannel = newState.guild.channels.cache.get(channel.id);
                if (!currentChannel) return;

                const currentHumans = currentChannel.members.filter(m => !m.user.bot).size;
                if (currentHumans < requiredUsers) {
                    log('[Podcast] ההתקהלות התפזרה בזמן ההמתנה. מבטל.');
                    return;
                }

                log(`[Podcast] מתחילים!`);
                lastPodcastTime = Date.now();
                activeChannelId = channel.id;

                // בטסט אני בוחר את מי שנכנס הרגע, ברגיל זה רנדומלי
                const victim = isTestMode ? humans.find(h => h.id === newState.member.id) : humans[Math.floor(Math.random() * humans.length)];

                await this.playPersonalPodcast(channel, victim);
            }, 6000); // 6 שניות המתנה
        }
    }

    async playPersonalPodcast(voiceChannel, member) {
        try {
            log(`[Podcast] מגנרט תסריט AI (ElevenLabs V3) עבור ${member.displayName}...`);
            const userData = await getUserData(member.id, 'discord');

            const roasts = userData?.brain?.roasts || [];
            const facts = userData?.brain?.facts?.map(f => f.content) || [];

            // --- 🧠 OpenAI Script Generation ---
            // --- 🧠 OpenAI Script Generation ---
            const prompt = `
            You are writing an EXTREMELY TOXIC, RUDE, and VULGAR podcast intro for "Shimon" and his sidekick "Shirly".
            The victim is: ${member.displayName}.
            
            DIRTY SECRETS (USE THESE TO HURT HIM):
            ${facts.length > 0 ? facts.join('\n') : "He has no life and no friends."}
            
            PAST HUMILIATIONS:
            ${roasts.length > 0 ? roasts.join('\n') : "He is boring as hell."}
            
            INSTRUCTIONS:
            1. Language: HEBREW ONLY. Street slang, Arsi, heavy cursing.
            2. Shimon Persona: Aggressive, disgusting, bullying, uses words like "Zain", "Manayak", "Efes", "Ben zona".
            3. Shirly Persona: Mean girl, condescending, laughs AT the victim, backs up Shimon's nastiness.
            4. GOAL: Destroy the victim's ego. Use the facts above specifically. If a fact says "he loves pizza", call him a "fat pig who eats pizza all day".
            5. Format:
            shimon: [Toxic opening]
            shirly: [Mean comment + Fact usage]
            shimon: [Final devastating insult]
            
            Keep it strictly 3-4 lines. Maximum damage.
            `;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "system", content: "You are a professional roast writer for a Discord podcast." }, { role: "user", content: prompt }]
            });

            const rawScript = completion.choices[0].message.content;
            const script = rawScript.split('\n').filter(l => l.includes(':')).map(line => {
                const [speaker, ...textParts] = line.split(':');
                return { speaker: speaker.trim().toLowerCase(), text: textParts.join(':').trim() };
            });

            // --- 🎤 ElevenLabs Generation Loop ---
            const voiceManager = require('../../ai/voice'); // ✅ שימוש במנהל הראשי והמתוקן
            const fs = require('fs');
            const path = require('path');

            // הגדרת קולות (IDs)
            const VOICES = {
                shimon: undefined, // ייקח את הדיפולט מ-voice.js
                shirly: 'pBZVCk298iJlHAcHQwLr' // האישה עם הקול היפה (User Request)
            };

            const audioFiles = [];

            for (const [index, line] of script.entries()) {
                const isShirly = line.speaker.includes('shirly') || line.speaker.includes('שירלי');
                const targetVoice = isShirly ? VOICES.shirly : VOICES.shimon;

                log(`[Podcast] מייצר שמע (V3) עבור ${line.speaker}...`);
                const buffer = await voiceManager.speak(line.text, targetVoice);

                if (buffer) {
                    const tempDir = path.join(__dirname, '../../temp_audio');
                    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

                    const fileName = `podcast_${member.id}_${index}_${Date.now()}.mp3`;
                    const filePath = path.join(tempDir, fileName);

                    await fs.promises.writeFile(filePath, buffer);
                    audioFiles.push(filePath);
                }
            }

            // ניגון הקבצים - סדרתי ומסונכרן
            for (const file of audioFiles) {
                // מנגן ומחכה שהקובץ יסתיים לפני שממשיך
                await audioManager.playLocalFileAndWait(voiceChannel.guild.id, voiceChannel.id, file);

                // המתנה קטנה לנשימה בין משפטים
                await new Promise(r => setTimeout(r, 500));
            }

            // ניקוי
            setTimeout(() => {
                audioFiles.forEach(f => {
                    try { fs.unlinkSync(f); } catch (e) { }
                });
                activeChannelId = null;
            }, 60000);

        } catch (error) {
            log(`❌ Podcast Script Error: ${error.message}`);
            activeChannelId = null;
        }
    }
}

module.exports = new PodcastManager();