// 📁 handlers/voice/podcast.js
const { log } = require('../../utils/logger');
const { getUserData } = require('../../utils/userUtils');
const audioManager = require('../audio/manager');
const voiceManager = require('../ai/voice'); // ✅ ElevenLabs Manager (Keep untouched)
const config = require('../ai/config');
const db = require('../../utils/firebase');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Configuration ---
const NEWS_COOLDOWN = 30 * 60 * 1000; // 30 Minutes for News
const DAILY_RESET_HOUR = 6; // 6:00 AM reset
let lastNewsTime = 0;
let dailySentUsers = new Set(); // Tracks users who got Seduction today
let lastReset = new Date().getDate();

// Debounce map to prevent flickering (4->3->4)
const stabilizationMap = new Map();

class PodcastManager {

    constructor() {
        // Periodic cleanup for daily reset
        setInterval(() => this._checkDailyReset(), 60 * 60 * 1000);
    }

    _checkDailyReset() {
        const today = new Date().getDate();
        if (today !== lastReset) {
            log('[Podcast] 🌅 Daily Reset of Seduction List.');
            dailySentUsers.clear();
            lastReset = today;
        }
    }

    async handleVoiceStateUpdate(oldState, newState) {
        if (newState.member.user.bot) return;

        const channel = newState.channel;
        if (!channel) return; // User Left (Handle disconnect logic if needed, but mainly we focus on joins)

        // Ignore Test Channel/AFK if needed (Add filters here)

        const humans = Array.from(channel.members.filter(m => !m.user.bot).values());
        const count = humans.length;

        // Prevent rapid firing on connect/disconnect flickering
        const channelId = channel.id;
        if (stabilizationMap.has(channelId)) clearTimeout(stabilizationMap.get(channelId));

        // Wait 3 seconds to ensure count is stable
        const timer = setTimeout(() => this._processStableState(channel, humans, count, newState.member), 3000);
        stabilizationMap.set(channelId, timer);
    }

    async _processStableState(channel, humans, count, triggerMember) {
        try {
            // MODE 1: BREAKING NEWS (Exactly 4 Users)
            if (count === 4) {
                if (Date.now() - lastNewsTime > NEWS_COOLDOWN) {
                    log(`[Podcast] 🚨 Triggering BREAKING NEWS (Count: 4) in ${channel.name}`);
                    lastNewsTime = Date.now();
                    await this.playBreakingNews(channel, humans);
                } else {
                    log(`[Podcast] ⏳ News Cooldown Active.`);
                }
                return;
            }

            // MODE 2: SEDUCTION (5+ Users)
            if (count > 4) {
                // Check if the SPECIFIC member who joined is the one triggering it
                // We rely on 'triggerMember' passed from update.
                // However, in _processStableState we have the list.
                // To be safe, we check if the Trigger Member is in the list and NOT served yet.

                if (dailySentUsers.has(triggerMember.id)) {
                    log(`[Podcast] 🛑 User ${triggerMember.displayName} already served Seduction today.`);
                    return;
                }

                // Check if triggerMember is actually present (didn't leave during debounce)
                if (!humans.find(h => h.id === triggerMember.id)) return;

                log(`[Podcast] 💋 Triggering SEDUCTION for ${triggerMember.displayName} (Count: ${count})`);
                await this.playSeduction(channel, triggerMember);

                // Mark as served
                dailySentUsers.add(triggerMember.id);
            }

        } catch (e) {
            log(`❌ [Podcast] Error in process logic: ${e.message}`);
        }
    }

    // --- MODE 1: BREAKING NEWS 🚨 ---
    async playBreakingNews(channel, members) {
        const names = members.map(m => m.displayName).join(', ');

        const prompt = `
        Scenario: "Breaking News" Broadcast interrupting a gaming session.
        Characters:
        1. Shimon: Aggressive, Toxic News Anchor. (Voice: Deep).
        2. Shirly: Flirty, Sexual Sidekick. (Voice: Seductive).

        Context:
        - Room: "${channel.name}"
        - Players Present: ${names}

        Goal:
        - Shimon insults them for being addicts/losers.
        - Shirly reads the list of names and promises a sexual reward if they win.

        Format:
        Shimon: <Line>
        Shirly: <Line>
        Shimon: <Line>
        Shirly: <Line>

        Language: Hebrew Slang. Short & Punchy.
        `;

        await this._generateAndPlay(channel, prompt, 'news');
    }

    // --- MODE 2: SEDUCTION 💋 ---
    async playSeduction(channel, member) {
        // Fetch User Data for Ammo
        const userData = await getUserData(member.id, 'discord');
        const facts = userData?.brain?.facts?.map(f => f.content) || [];
        const personalContext = facts.slice(0, 2).join('. ') || "No specific data.";

        const prompt = `
        Scenario: Shirly (Femme Fatale) welcomes a specific user who just joined.
        Target: "${member.displayName}".
        Context: ${personalContext}

        Goal:
        - Be EXTREMELY flirty and sexual.
        - Roast them on a specific trait (e.g. gambling, bad aim) but make it sound hot.
        - "I've been waiting for you..." vibe.

        Format:
        Shirly: <Monologue>

        Length: 2-3 sentences max.
        Language: Hebrew Slang.
        `;

        await this._generateAndPlay(channel, prompt, 'seduction');
    }

    // --- CORE GENERATOR (Shared) ---
    async _generateAndPlay(channel, prompt, mode) {
        try {
            // 1. Generate Script
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "system", content: "You are a creative scriptwriter for a gaming bot." }, { role: "user", content: prompt }],
                max_tokens: 300,
                temperature: 0.9 + (Math.random() * 0.1) // High creativity
            });

            const scriptText = completion.choices[0].message.content;
            const script = this._parseScript(scriptText);

            if (!script.length) throw new Error("Empty Script Generated");

            // 2. Audio Pipeline
            const queue = [];
            const tempDir = path.join(__dirname, '../../temp_audio');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            // Intro Sound
            const introFile = mode === 'news' ? 'breaking_news.mp3' : 'intro.mp3';
            const introPath = path.join(__dirname, `../../assets/audio/effects/${introFile}`);
            if (fs.existsSync(introPath)) queue.push({ type: 'file', path: introPath });

            // TTS Generation (ElevenLabs)
            for (const [i, line] of script.entries()) {
                const buffer = await voiceManager.speak(line.text, {
                    voiceId: line.voiceId,
                    stability: 0.4, // Lower for more emotion
                    similarityBoost: 0.85
                });

                if (buffer) {
                    const filePath = path.join(tempDir, `pod_v3_${i}_${Date.now()}.mp3`);
                    fs.writeFileSync(filePath, buffer);
                    queue.push({ type: 'file', path: filePath, temp: true });
                }
            }

            // Playback
            for (const item of queue) {
                await audioManager.playLocalFileAndWait(channel.guild.id, channel.id, item.path);
                // Pause breakdown: Fast for news, Slow for seduction
                const pause = mode === 'news' ? 300 : 800;
                await new Promise(r => setTimeout(r, pause));
            }

            // Cleanup
            setTimeout(() => {
                queue.filter(i => i.temp).forEach(i => {
                    try { fs.unlinkSync(i.path); } catch (e) { }
                });
            }, 5000);

        } catch (e) {
            log(`❌ [Podcast] Gen Fail: ${e.message}`);
        }
    }

    _parseScript(text) {
        return text.split('\n').filter(l => l.includes(':')).map(line => {
            const [speaker, ...content] = line.split(':');
            const name = speaker.trim().toLowerCase();
            return {
                speaker: name,
                text: content.join(':').trim(),
                voiceId: name.includes('shirly') ? config.SHIRLY_VOICE_ID : config.SHIMON_VOICE_ID
            };
        });
    }
}

module.exports = new PodcastManager();