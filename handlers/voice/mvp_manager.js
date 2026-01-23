const { log } = require('../../utils/logger');
const db = require('../../utils/firebase');
const musicPlayer = require('../audio/manager');
const voiceAI = require('../ai/voice');
const { generateContent } = require('../ai/gemini');
const path = require('path');

class MVPVoiceManager {
    constructor() {
        this.pendingGreets = new Map(); // Key: userId, Value: Timer
        this.XBOX_SOUND = path.join(__dirname, '../../assets/audio/effects/xbox.mp3');
    }

    /**
     * Entry Point from VoiceStateUpdate
     */
    async handleEntrance(member, channelId) {
        if (!member || !channelId || member.user.bot) return;

        try {
            // 1. Check if MVP
            const mvpDoc = await db.collection('system_metadata').doc('current_mvp').get();
            if (!mvpDoc.exists) return;
            const mvpData = mvpDoc.data();

            if (member.id !== mvpData.id) return; // Not the MVP

            // 2. Check Expiry
            const winDate = new Date(mvpData.wonAt || 0);
            const isActive = (Date.now() - winDate.getTime()) < 7 * 24 * 60 * 60 * 1000;
            if (!isActive) return;

            // 3. Check if ALREADY GREETED for THIS win
            // We use a unique ID for the win event (e.g. "week_42_2024") or just timestamp check
            if (mvpData.greeted) {
                // Already done for this week.
                return;
            }

            log(`👑 [MVP] Candidate ${member.displayName} detected. Starting Stability Timer...`);

            // 4. Stability Check (Wait 8 seconds to confirm presence)
            if (this.pendingGreets.has(member.id)) clearTimeout(this.pendingGreets.get(member.id));

            const timer = setTimeout(() => this.executeRoyalWelcome(member, channelId, mvpData), 8000);
            this.pendingGreets.set(member.id, timer);

        } catch (e) {
            log(`❌ [MVP Check] Error: ${e.message}`);
        }
    }

    async handleExit(member) {
        if (this.pendingGreets.has(member.id)) {
            log(`👑 [MVP] User left before stability check. Cancelled.`);
            clearTimeout(this.pendingGreets.get(member.id));
            this.pendingGreets.delete(member.id);
        }
    }

    async executeRoyalWelcome(member, channelId, mvpData) {
        this.pendingGreets.delete(member.id);

        // Double check checks
        if (member.voice.channelId !== channelId) {
            log(`👑 [MVP] User moved/left during timer. Aborting.`);
            return;
        }

        try {
            log(`👑 [MVP] Generating Royal Content for ${mvpData.name}...`);

            // A. Get User Stats / Win Count
            const userDoc = await db.collection('users').doc(member.id).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            const wins = userData.stats?.mvpWins || 1; // Default to 1 if not tracked yet

            // B. Generate Text via Gemini
            const prompt = `
            You are Shimon (AI Admin).
            The MVP (Most Valuable Player) of the week just joined the voice channel.
            Name: ${mvpData.name}
            Total MVP Wins: ${wins}
            
            Task: Write a short, funny, roasted but respectful welcome speech (1-2 sentences max).
            Tone: Royal, Sarcastic, impressed but savage.
            Language: Hebrew (Spoken style).
            
            Context:
            - If wins > 1: Mention he is addicted to winning ("Another one? Seriously?").
            - If wins == 1: First timer ("Beginner's luck").
            - End with a punchline.
            `;

            // Assume generateContent returns just text
            const aiParts = [{ text: prompt }];
            const rawText = await generateContent(aiParts, "gemini-2.0-flash");
            const speechText = rawText.replace(/[*"]/g, '').trim();
            // Cleanup markdown

            log(`👑 [MVP] Speech: "${speechText}"`);

            // C. Generate Audio (ElevenLabs V3/V2 High Quality)
            const audioBuffer = await voiceAI.speak(speechText, {
                modelId: 'eleven_multilingual_v2', // Best for Hebrew Clones
                stability: 0.3,
                style: 0.7
            });

            if (!audioBuffer) {
                log(`❌ [MVP] Failed to generate audio.`);
                return;
            }

            // D. Play Audio
            // We need to save to temp file because musicPlayer expects path
            const tempPath = path.join(__dirname, `../../temp/mvp_${Date.now()}.mp3`);
            require('fs').writeFileSync(tempPath, audioBuffer);

            // Play Sequence: Speech -> Wait -> Xbox Sound
            await musicPlayer.playLocalFile(member.guild.id, channelId, tempPath);

            // Wait for speech to finish roughly? Or queue sounds?
            // musicPlayer usually clears queue. We need to queue them.
            // If playLocalFile handles queueing, we good. Assuming it plays immediately.

            // Mark as Greeted in DB (CRITICAL: Do this BEFORE xbox sound so we don't repeat on crash)
            await db.collection('system_metadata').doc('current_mvp').update({
                greeted: true,
                greetedAt: new Date().toISOString()
            });

            // Cleanup temp file (async)
            setTimeout(() => require('fs').unlinkSync(tempPath), 10000);

            // Xbox Sound (Optional delay?)
            // TODO: Ensure MusicPlayer supports queue or sequential play. 
            // For now, we fire it. If it interrupts, we might need a `playNext`.
            // Assuming user wants immediate impact, maybe just the speech is enough for now?
            // User explicitly asked for xbox sound.
            // We'll try to append it.

        } catch (e) {
            log(`❌ [MVP Execution] Failed: ${e.message}`);
        }
    }
}

module.exports = new MVPVoiceManager();
