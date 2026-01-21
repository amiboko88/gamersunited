// 📁 handlers/voice/podcast.js
const { log } = require('../../utils/logger');
const { getUserData } = require('../../utils/userUtils');
const audioManager = require('../audio/manager');
const voiceManager = require('../ai/voice'); // ✅ ElevenLabs Manager
const config = require('../ai/config');
const db = require('../../utils/firebase'); // For Stats Query
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MIN_USERS = 3;
const COOLDOWN = 30 * 60 * 1000;
let lastPodcastTime = 0;
let isStabilizing = false;
let activeChannelId = null;

class PodcastManager {

    async handleVoiceStateUpdate(oldState, newState) {
        // 🛑 1. Ignore Bot's own movements
        if (newState.member.user.bot) {
            if (!newState.channelId && oldState.channelId === activeChannelId) {
                log('[Podcast] Bot disconnected. Clearing state.');
                activeChannelId = null;
                isStabilizing = false;
            }
            return;
        }

        const channel = newState.channel;

        // 🛑 2. Active Session Logic
        if (activeChannelId) {
            if (oldState.channelId !== activeChannelId && newState.channelId !== activeChannelId) return;

            const guild = oldState.guild || newState.guild;
            const activeChannel = guild.channels.cache.get(activeChannelId);

            if (!activeChannel) {
                activeChannelId = null;
                return;
            }

            const currentMembers = activeChannel.members.filter(m => !m.user.bot).size;
            if (currentMembers < MIN_USERS) {
                log('[Podcast] Audience too small (<3). Stopping session.');
                const audioPlayer = require('../audio/manager');
                if (audioPlayer.stop) audioPlayer.stop(guild.id);
                activeChannelId = null;
                isStabilizing = false;
            }
            return;
        }

        // 🛑 3. Validation for New Session
        if (!channel) return;

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
        log(`[Podcast] Generating Script (ElevenLabs + Stats) for ${member.displayName}...`);

        // 1. Data Fetch (Stats + Facts)
        const userData = await getUserData(member.id, 'discord');
        const roasts = userData?.brain?.roasts || [];
        const facts = userData?.brain?.facts?.map(f => f.content) || [];

        // 🔍 Fetch Last Game Stats
        let statsContext = "No recent games recorded.";
        try {
            const gamesSnap = await db.collection('users').doc(member.id).collection('games')
                .orderBy('timestamp', 'desc').limit(1).get();

            if (!gamesSnap.empty) {
                const game = gamesSnap.docs[0].data();
                const kills = game.kills || 0;
                const damage = game.damage || 0;
                const mode = game.mode || 'Warzone';

                let performance = "AVERAGE";
                if (kills === 0) performance = "TRASH (0 Kills)";
                else if (kills > 7) performance = "SWEATY TRYHARD";
                else if (damage < 500) performance = "PACIFIST (No Damage)";

                statsContext = `LAST MATCH (${mode}): ${kills} Kills, ${damage} Dmg. Performance: ${performance}.`;
            }
        } catch (e) { log(`⚠️ Failed to fetch stats: ${e.message}`); }

        const contextData = [...facts, ...roasts].slice(0, 3);
        const personalContext = contextData.length ? contextData.join('\n') : "Just roast him generically.";

        // 2. GPT-4o Script Generation
        const prompt = `
        Characters:
        1. Shimon: 40yo Israeli Ars. Voice: Deep, Hoarse, Aggressive.
        2. Shirly: 25yo Cynical Tel-Avivian. Voice: High, Bored, Sarcastic.

        Goal: Roast "${member.displayName}".
        
        🔥 REQUIRED CONTEXT 🔥
        ${statsContext}
        
        Additional Info:
        ${personalContext}

        Rules:
        - ⚠️ MUST reference the Kills/Damage from the Last Match if available!
        - Language: STREET HEBREW (Slang allowed, English gaming terms ok).
        - Length: EXACTLY 3 lines.
        - Format: Speaker: Text
        - Order: Shimon -> Shirly -> Shimon.
        - Style: Brutal, Funny, Authentic.

        Output Example:
        Shimon: בואנה שירלי, ראית את ה-0 הריגות של עמי? פדיחות.
        Shirly: עזוב נו, הוא עשה 200 נזק, הוא ירה בציפורים כל המשחק.
        Shimon: ציפורים עאלק, זה נראה כאילו הוא משחק עם הרגליים.
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: "You are a savage Israeli comedy writer." }, { role: "user", content: prompt }],
            max_tokens: 300,
            temperature: 0.95
        });

        const rawScript = completion.choices[0].message.content;
        const script = rawScript.split('\n').filter(l => l.includes(':')).map(line => {
            const [speaker, ...textParts] = line.split(':');
            const name = speaker.trim().toLowerCase();
            return {
                speaker: name,
                text: textParts.join(':').trim(),
                // Select Voice ID based on speaker name
                voiceId: name.includes('shirly') ? config.SHIRLY_VOICE_ID : config.SHIMON_VOICE_ID
            };
        });

        if (!script.length) throw new Error("Script generation failed (Empty)");

        // 3. Audio Construction (ElevenLabs)
        const queue = [];

        // Intro
        const introPath = path.join(__dirname, '../../assets/audio/effects/intro.mp3');
        if (fs.existsSync(introPath)) queue.push({ type: 'file', path: introPath });

        // TTS Generation
        const tempDir = path.join(__dirname, '../../temp_audio');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        for (const [i, line] of script.entries()) {
            // Call ElevenLabs via VoiceManager
            const buffer = await voiceManager.speak(line.text, {
                voiceId: line.voiceId,
                stability: 0.5,
                similarityBoost: 0.8
            });

            if (buffer) {
                const filePath = path.join(tempDir, `pod_eleven_${member.id}_${i}_${Date.now()}.mp3`);
                fs.writeFileSync(filePath, buffer);
                queue.push({ type: 'file', path: filePath, temp: true });
            }
        }

        // Laugh Track
        const laughPath = path.join(__dirname, '../../assets/audio/effects/laugh.mp3');
        if (fs.existsSync(laughPath)) queue.push({ type: 'file', path: laughPath });

        // 4. Playback
        for (const item of queue) {
            if (!activeChannelId) break;
            await audioManager.playLocalFileAndWait(voiceChannel.guild.id, voiceChannel.id, item.path);
            await new Promise(r => setTimeout(r, 600)); // Natural pause between speakers
        }

        // 5. Cleanup
        setTimeout(() => {
            queue.filter(i => i.temp).forEach(i => {
                try { fs.unlinkSync(i.path); } catch (e) { }
            });
            activeChannelId = null;
            const am = require('../audio/manager');
            if (am.stop) am.stop(voiceChannel.guild.id);
        }, 2000);
    }
}

module.exports = new PodcastManager();