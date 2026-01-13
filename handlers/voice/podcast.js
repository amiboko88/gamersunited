// 📁 handlers/voice/podcast.js
const { log } = require('../../utils/logger');
const ttsEngine = require('./openaiTTS');
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
            log(`[Podcast] ${isTestMode ? '🔴 מצב טסט הופעל!' : 'זיהיתי התקהלות...'} מתחילים!`);
            lastPodcastTime = now;
            activeChannelId = channel.id;

            // בטסט אני בוחר את מי שנכנס הרגע, ברגיל זה רנדומלי
            const victim = isTestMode ? humans.find(h => h.id === newState.member.id) : humans[Math.floor(Math.random() * humans.length)];

            await this.playPersonalPodcast(channel, victim);
        }
    }

    async playPersonalPodcast(voiceChannel, member) {
        try {
            log(`[Podcast] מגנרט תסריט AI (ElevenLabs V3) עבור ${member.displayName}...`);
            const userData = await getUserData(member.id, 'discord');

            const roasts = userData?.brain?.roasts || [];
            const facts = userData?.brain?.facts?.map(f => f.content) || [];

            // --- 🧠 OpenAI Script Generation ---
            const prompt = `
            You are writing a short, funny, and mean podcast script for a Discord bot named "Shimon" and his co-host "Shirly".
            The target (victim) is ${member.displayName}.
            Here is what we know about him:
            Facts: ${facts.join(', ')}
            Common Roasts: ${roasts.join(', ')}
            
            The script should be in Hebrew. 
            Shimon is cynical, "Arsi", and aggressive. 
            Shirly is sharp, sarcastic, and backs Shimon up.
            
            Format:
            shimon: [text]
            shirly: [text]
            shimon: [text]
            
            Keep it under 4 lines total.
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
            const voiceEngine = require('../media/voice');
            const fs = require('fs');
            const path = require('path');

            // הגדרת קולות (IDs)
            const VOICES = {
                shimon: undefined, // ייקח את הדיפולט מ-voice.js
                shirly: 'EXAVITQu4vr4xnSDxMaL' // קול נשי (Bella/Rachel) - ניתן לשנות
            };

            const audioFiles = [];

            for (const [index, line] of script.entries()) {
                const isShirly = line.speaker.includes('shirly') || line.speaker.includes('שירלי');
                const targetVoice = isShirly ? VOICES.shirly : VOICES.shimon;

                log(`[Podcast] מייצר שמע (V3) עבור ${line.speaker}...`);
                const buffer = await voiceEngine.textToSpeech(line.text, targetVoice);

                if (buffer) {
                    const tempDir = path.join(__dirname, '../../temp_audio');
                    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

                    const fileName = `podcast_${member.id}_${index}_${Date.now()}.mp3`;
                    const filePath = path.join(tempDir, fileName);

                    await fs.promises.writeFile(filePath, buffer);
                    audioFiles.push(filePath);
                }
            }

            // ניגון הקבצים
            for (const file of audioFiles) {
                await audioManager.playLocalFile(voiceChannel.guild.id, voiceChannel.id, file);
                // המתנה גסה של אורך הקובץ + באפר קטן (ניתן לשפר עם בדיקת אורך אמיתית)
                await new Promise(r => setTimeout(r, 4000));
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