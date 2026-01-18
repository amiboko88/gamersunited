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
            const prompt = `
            Generate a short, funny, and stinging "Roast" script in HEBREW for two fictional characters:
            1. Shimon: An aggressive Israeli "Ars" (street tough guy), uses heavy slang.
            2. Shirly: His cynical, mean female sidekick.

            Target: ${member.displayName}

            Material to use (incorporate these into the roast):
            ${facts.length > 0 ? facts.join('\n') : "He is boring and generic."}
            ${roasts.length > 0 ? roasts.join('\n') : ""}

            Format:
            shimon: [Opening roast line]
            shirly: [Mean comment using the material above]
            shimon: [Final punchline]

            Rules:
            - HEBREW ONLY.
            - Style: Israeli Stand-up Roast / "Eretz Nehederet" sketch.
            - Be harsh but funny. Use slang like "Ahi", "Walla", "Eize efes".
            - Keep it under 4 lines total.
            `;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini", // ✅ חיסכון משמעותי בעלויות
                messages: [{ role: "system", content: "You are a scriptwriter for an edgy Israeli comedy show. Write dialogue in Hebrew slang." }, { role: "user", content: prompt }]
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

            // --- 🎤 ElevenLabs V3 Generation Loop (Sequential) ---
            // Reverting to V3 per user request, but with SEQUENTIAL processing to avoid 400 errors.
            const voiceManager = require('../ai/voice');
            const fs = require('fs');
            const path = require('path');

            // Define Voices (Primary Choice)
            const VOICES = {
                shimon: 'txHtK15K5KtX959ZtpRa', // ✅ User's Cloned Voice (Primary)
                shirly: '21m00Tcm4TlvDq8ikWAM' // Rachel (Reliable Female)
            };

            const playbackQueue = []; // Supports { type: 'tts', path: string } or { type: 'sfx', path: string }

            // 1. Add Intro Jingle (Optional)
            const introPath = path.join(__dirname, '../../assets/audio/effects/intro.mp3'); // ✅ User Path
            if (fs.existsSync(introPath)) {
                playbackQueue.push({ type: 'sfx', path: introPath });
            }

            // 2. Process Script
            for (const [index, line] of script.entries()) {
                const isShirly = line.speaker.includes('shirly') || line.speaker.includes('שירלי');
                const targetVoice = isShirly ? VOICES.shirly : VOICES.shimon;

                log(`[Podcast] מעבד שורה ${index + 1}/${script.length} (${line.speaker})...`);

                // A. Check for Sound FX triggers in text (e.g., *laugh*)
                if (line.text.includes('*') || line.text.includes('[')) {
                    if (line.text.toLowerCase().includes('laugh') || line.text.includes('צחוק')) {
                        const laughPath = path.join(__dirname, '../../assets/audio/effects/laugh.mp3'); // ✅ User Path
                        if (fs.existsSync(laughPath)) {
                            playbackQueue.push({ type: 'sfx', path: laughPath });
                        }
                    }
                }

                // B. Generate TTS (With Fallback Strategy)
                try {
                    // Remove SFX markers
                    const spokenText = line.text.replace(/\[.*?\]|\*.*?\*/g, '').trim();

                    if (spokenText) {
                        let buffer = null;

                        // 1. Try Primary Voice (User's Clone for Shimon)
                        try {
                            buffer = await voiceManager.speak(spokenText, {
                                voiceId: targetVoice,
                                similarityBoost: 0.60 // Safer for V3 Podcast Flow to avoid 400s
                            });
                        } catch (primaryError) {
                            log(`⚠️ [Podcast] Primary Voice Failed (${targetVoice}): ${primaryError.message}`);

                            // 2. Fallback to Safe Voice (Adam/Rachel) if Primary is Shimon
                            if (!isShirly) {
                                log(`🔄 [Podcast] Falling back to Reliable Voice (Adam)...`);
                                try {
                                    buffer = await voiceManager.speak(spokenText, {
                                        voiceId: 'JBFqnCBsd6RMkjVDRZzb', // Adam
                                        similarityBoost: 0.50 // Even safer
                                    });
                                } catch (backupError) {
                                    log(`❌ [Podcast] Backup Voice also failed.`);
                                }
                            }
                        }

                        if (buffer) {
                            const tempDir = path.join(__dirname, '../../temp_audio');
                            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

                            const fileName = `podcast_${member.id}_${index}_${Date.now()}.mp3`;
                            const filePath = path.join(tempDir, fileName);

                            await fs.promises.writeFile(filePath, buffer);
                            playbackQueue.push({ type: 'tts', path: filePath });
                        } else {
                            log(`❌ [Podcast] Failed to generate line ${index}: Buffer empty after all attempts.`);
                        }
                    }
                } catch (genError) {
                    log(`❌ [Podcast] Error processing line ${index}: ${genError.message}`);
                }

                // Small delay between requests to be nice to API
                await new Promise(r => setTimeout(r, 500));
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