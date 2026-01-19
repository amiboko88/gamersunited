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
let isStabilizing = false; // 🔒 מנעול לטיפול ב-Race Condition

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
            // 🔒 בדיקת מנעול - אם כבר מייצבים, לא להתחיל שוב
            if (isStabilizing) return;

            isStabilizing = true;
            log(`[Podcast] זיהיתי התקהלות... ממתין לכרוז (Stabilizing)...`);

            // השהיה קצרה כדי לתת לכרוז לסיים או להתייצב
            setTimeout(async () => {
                // בדיקה חוזרת: האם כולם עדיין שם?
                const currentChannel = newState.guild.channels.cache.get(channel.id);
                if (!currentChannel) return;

                const currentHumans = currentChannel.members.filter(m => !m.user.bot).size;
                if (currentHumans < requiredUsers) {
                    log('[Podcast] ההתקהלות התפזרה בזמן ההמתנה. מבטל.');
                    isStabilizing = false; // 🔓 שחרור מנעול
                    return;
                }

                log(`[Podcast] מתחילים!`);
                isStabilizing = false; // 🔓 שחרור מנעול - מתחילים בניגון
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
            // --- 🧠 OpenAI Script Generation (Short & Punchy) ---
            // Filter and Shuffle Data to prevent overload
            const safeFacts = facts.sort(() => 0.5 - Math.random()).slice(0, 2);
            const safeRoasts = roasts.sort(() => 0.5 - Math.random()).slice(0, 2);

            const prompt = `
            Write a SUPER SHORT, SAVAGE Hebrew dialogue between Shimon (Ars) and Shirly (Cynical).
            Target: ${member.displayName}
            
            Context Data (Pick ONE item to use):
            ${safeFacts.length > 0 ? safeFacts.join('\n') : "No data - just roast him for being basic."}
            ${safeRoasts.length > 0 ? safeRoasts.join('\n') : ""}

            Strict Rules:
            1. HEBREW SLANG ONLY.
            2. TOTAL LENGTH: Max 3 lines.
            3. KEEP IT SHORT. Max 10 words per line.
            4. If data exists, use it for a direct burn.
            5. If no data, be rude and dismissive.

            Format:
            shimon: [Short punchy line]
            shirly: [Short mean response]
            shimon: [Final kill]
            `;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a rude Israeli scriptwriter. Write short, aggressive, and funny dialogue." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 150 // Hard limit on output length
            });

            const rawScript = completion.choices[0].message.content;
            log(`📝 [Podcast Debug] Raw Script from GPT:\n${rawScript}`); // 🐛 Debug Log

            const script = rawScript.split('\n').filter(l => l.includes(':')).map(line => {
                const [speaker, ...textParts] = line.split(':');
                return { speaker: speaker.trim().toLowerCase(), text: textParts.join(':').trim() };
            });

            log(`📝 [Podcast Debug] Parsed Script Length: ${script.length}`); // 🐛 Debug Log
            if (script.length === 0) {
                log('❌ [Podcast] Error: Script is empty after parsing!');
                return;
            }

            // --- 🎤 Google Gemini TTS Generation (User Request) ---
            // Using Google's Generative AI Model (Flash/Pro) with provided Key
            const googleTTS = require('../ai/google_tts');
            const fs = require('fs');
            const path = require('path');

            // Google Gemini Voices
            // 'Fenrir' = Deep/Strong (Good for Shimon)
            // 'Aoede' = Clear/Professional (Good for Shirly)
            const VOICES = {
                shimon: 'Fenrir',
                shirly: 'Aoede'
            };

            const playbackQueue = [];

            // 1. Add Intro Jingle
            const introPath = path.join(__dirname, '../../assets/audio/effects/intro.mp3');
            if (fs.existsSync(introPath)) {
                playbackQueue.push({ type: 'sfx', path: introPath });
            }

            // 2. Process Script
            for (const [index, line] of script.entries()) {
                const isShirly = line.speaker.includes('shirly') || line.speaker.includes('שירלי');
                const targetVoice = isShirly ? VOICES.shirly : VOICES.shimon;

                log(`[Podcast] מעבד שורה ${index + 1}/${script.length} (${line.speaker})...`);

                // A. Check for Sound FX
                if (line.text.includes('*') || line.text.includes('[')) {
                    if (line.text.toLowerCase().includes('laugh') || line.text.includes('צחוק')) {
                        const laughPath = path.join(__dirname, '../../assets/audio/effects/laugh.mp3');
                        if (fs.existsSync(laughPath)) {
                            playbackQueue.push({ type: 'sfx', path: laughPath });
                        }
                    }
                }

                // B. Generate TTS (Google Gemini)
                try {
                    const spokenText = line.text.replace(/\[.*?\]|\*.*?\*/g, '').trim();

                    if (spokenText) {
                        const buffer = await googleTTS.speak(spokenText, targetVoice);

                        if (buffer) {
                            const tempDir = path.join(__dirname, '../../temp_audio');
                            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

                            const fileName = `podcast_${member.id}_${index}_${Date.now()}.mp3`;
                            const filePath = path.join(tempDir, fileName);

                            await fs.promises.writeFile(filePath, buffer);
                            playbackQueue.push({ type: 'tts', path: filePath });
                        } else {
                            log(`❌ [Podcast] Buffer empty for line ${index}`);
                        }
                    }
                } catch (genError) {
                    log(`❌ [Podcast] Error processing line ${index}: ${genError.message}`);
                }

                // Gemini is fast, minimal delay needed
                await new Promise(r => setTimeout(r, 200));
            }

            // 3. Playback Loop
            for (const item of playbackQueue) {
                if (item.type === 'tts' || item.type === 'sfx') {
                    await audioManager.playLocalFileAndWait(voiceChannel.guild.id, voiceChannel.id, item.path);
                    // Pause for pacing
                    await new Promise(r => setTimeout(r, 600));
                }
            }

            // 4. Cleanup
            setTimeout(() => {
                playbackQueue.forEach(item => {
                    if (item.type === 'tts') {
                        try { fs.unlinkSync(item.path); } catch (e) { }
                    }
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