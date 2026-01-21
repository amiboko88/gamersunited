// 📁 handlers/voice/podcast.js
const { log } = require('../../utils/logger');
const { getUserData } = require('../../utils/userUtils');
const audioManager = require('../audio/manager'); // Using the robust audio manager
const openaiTTS = require('../ai/openai_tts');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MIN_USERS = 3;
const COOLDOWN = 30 * 60 * 1000;
let lastPodcastTime = 0;
// We use a simple lock to prevent double-triggering
let isStabilizing = false;
let activeChannelId = null;

class PodcastManager {

    async handleVoiceStateUpdate(oldState, newState) {
        // 🛑 1. Ignore Bot's own movements (Prevent Zombie Loop)
        if (newState.member.user.bot) {
            // If the bot disconnected, clear state immediately
            if (!newState.channelId && oldState.channelId === activeChannelId) {
                log('[Podcast] Bot disconnected. Clearing state.');
                activeChannelId = null;
                isStabilizing = false;
            }
            return;
        }

        const channel = newState.channel;

        // 🛑 2. Active Session Logic (Exit if crowd disperses)
        if (activeChannelId) {
            // strict check: if the event is unrelated to the active channel, ignore
            if (oldState.channelId !== activeChannelId && newState.channelId !== activeChannelId) return;

            const guild = oldState.guild || newState.guild;
            const activeChannel = guild.channels.cache.get(activeChannelId);

            if (!activeChannel) {
                activeChannelId = null; // Channel deleted?
                return;
            }

            const currentMembers = activeChannel.members.filter(m => !m.user.bot).size;
            if (currentMembers < MIN_USERS) {
                log('[Podcast] Audience too small (<3). Stopping session.');
                // Force stop audio
                const audioPlayer = require('../audio/manager');
                if (audioPlayer.stop) audioPlayer.stop(guild.id);
                activeChannelId = null;
                isStabilizing = false;
            }
            return;
        }

        // 🛑 3. Validation for New Session
        if (!channel) return; // Disconnect event (handled above if active, ignored otherwise)

        // Custom Test Channel
        const TEST_CHANNEL_ID = '1396779274173943828';
        const isTestMode = channel.id === TEST_CHANNEL_ID;

        const now = Date.now();
        if (!isTestMode && now - lastPodcastTime < COOLDOWN) return;

        const humans = Array.from(channel.members.filter(m => !m.user.bot).values());
        const requiredUsers = isTestMode ? 1 : MIN_USERS;

        // 🚀 4. Trigger Sequence
        if (humans.length >= requiredUsers) {
            if (isStabilizing) return;
            isStabilizing = true;
            log(`[Podcast] Crowd detected... Stabilizing (6s)...`);

            setTimeout(async () => {
                // Re-validate after delay
                const targetChannel = newState.guild.channels.cache.get(channel.id);
                if (!targetChannel) { isStabilizing = false; return; }

                const finalHumans = targetChannel.members.filter(m => !m.user.bot).size;
                if (finalHumans < requiredUsers) {
                    log('[Podcast] Crowd dispersed during stabilization. Cancelled.');
                    isStabilizing = false;
                    return;
                }

                log(`[Podcast] 🎙️ LIVE! Starting session.`);
                isStabilizing = false;
                lastPodcastTime = Date.now();
                activeChannelId = channel.id;

                // Pick Victim
                const victim = humans.find(h => h.id === newState.member.id) || humans[Math.floor(Math.random() * humans.length)];

                try {
                    await this.playPersonalPodcast(channel, victim);
                } catch (e) {
                    log(`❌ [Podcast] Critical Playback Fail: ${e.message}`);
                    activeChannelId = null;
                    const audioPlayer = require('../audio/manager');
                    audioPlayer.stop(channel.guild.id);
                }

            }, 6000);
        }
    }

    async playPersonalPodcast(voiceChannel, member) {
        log(`[Podcast] Generating Script (GPT-4o) for ${member.displayName}...`);

        // 1. Data Fetch
        const userData = await getUserData(member.id, 'discord');
        const roasts = userData?.brain?.roasts || [];
        const facts = userData?.brain?.facts?.map(f => f.content) || [];
        const contextData = [...facts, ...roasts].sort(() => 0.5 - Math.random()).slice(0, 3);
        const contextStr = contextData.length ? contextData.join('\n') : "Just roast him for being boring.";

        // 2. GPT-4o Script Generation
        const prompt = `
        Characters:
        1. Shimon: 40yo Israeli Ars. Rude, loud, slang-heavy.
        2. Shirly: 25yo Cynical Tel-Avivian. Sarcastic, bored.

        Goal: Roast "${member.displayName}".
        Context: ${contextStr}

        Rules:
        - Language: STREET HEBREW (Slang allowed).
        - Length: EXACTLY 3 lines.
        - Format: Speaker: Text
        - Order: Shimon -> Shirly -> Shimon.
        - Vibe: Savage, funny.

        Output Example:
        Shimon: תגידי שירלי, ראית את הטישרט של עמי? נראה כמו סחבה.
        Shirly: עזוב נו, הוא חושב שזה וינטג', בפועל זה סתם כתם של טחינה.
        Shimon: וינטג' עאלק, זה נראה כמו משהו שמצאו בפח של רמי לוי.
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: "You are a savage Israeli comedy writer." }, { role: "user", content: prompt }],
            max_tokens: 250,
            temperature: 0.9
        });

        const rawScript = completion.choices[0].message.content;
        const script = rawScript.split('\n').filter(l => l.includes(':')).map(line => {
            const [speaker, ...textParts] = line.split(':');
            return {
                speaker: speaker.trim().toLowerCase(),
                text: textParts.join(':').trim(),
                persona: speaker.toLowerCase().includes('shirly') ? 'shirly' : 'shimon'
            };
        });

        if (!script.length) throw new Error("Script generation failed (Empty)");

        // 3. Audio Construction
        const queue = [];

        // Intro
        const introPath = path.join(__dirname, '../../assets/audio/effects/intro.mp3');
        if (fs.existsSync(introPath)) queue.push({ type: 'file', path: introPath });

        // TTS Generation
        const tempDir = path.join(__dirname, '../../temp_audio');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        for (const [i, line] of script.entries()) {
            const buffer = await openaiTTS.speak(line.text, line.persona);
            if (buffer) {
                const filePath = path.join(tempDir, `pod_${member.id}_${i}_${Date.now()}.mp3`);
                fs.writeFileSync(filePath, buffer);
                queue.push({ type: 'file', path: filePath, temp: true });
            }
        }

        // 4. Playback
        for (const item of queue) {
            // Check if still active before playing next track
            if (!activeChannelId) break;
            await audioManager.playLocalFileAndWait(voiceChannel.guild.id, voiceChannel.id, item.path);
            await new Promise(r => setTimeout(r, 600)); // Pacing
        }

        // 5. Cleanup
        setTimeout(() => {
            queue.filter(i => i.temp).forEach(i => {
                try { fs.unlinkSync(i.path); } catch (e) { }
            });
            // Graceful exit
            activeChannelId = null;
            // audioManager.stop(voiceChannel.guild.id); // Optional: Disconnect after show? User might want bot to stay.
            // Let's disconnect to be safe and avoid getting stuck.
            const am = require('../audio/manager');
            if (am.stop) am.stop(voiceChannel.guild.id);
        }, 1000); // Quick cleanup
    }
}

module.exports = new PodcastManager();