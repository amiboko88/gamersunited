// 📁 handlers/voice/openaiTTS.js
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const admin = require('firebase-admin');
const db = require('../../utils/firebase');
const { getUserRef } = require('../../utils/userUtils');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const USAGE_COLLECTION = 'openAiTtsUsage'; 

const VOICE_POOLS = {
    shimon: ['ash', 'onyx', 'echo'],
    shirly: ['coral', 'nova', 'shimmer'],
    narrator: ['alloy', 'fable']
};

class OpenAITTS {

    async synthesizeConversation(script, member) {
        const audioFiles = [];
        const sessionVoices = {
            shimon: this.getRandomVoice('shimon'),
            shirly: this.getRandomVoice('shirly'),
            narrator: this.getRandomVoice('narrator')
        };

        log(`[TTS] גנרציה של פודקאסט (${script.length} שורות)...`);

        for (const [index, line] of script.entries()) {
            const speakerKey = line.speaker.toLowerCase();
            let selectedVoice = sessionVoices.narrator;

            if (speakerKey.includes('shimon') || speakerKey.includes('שמעון')) {
                selectedVoice = sessionVoices.shimon;
            } else if (speakerKey.includes('shirly') || speakerKey.includes('שירלי')) {
                selectedVoice = sessionVoices.shirly;
            }

            const fileName = `line_${index}_${Date.now()}.mp3`;
            const filePath = await this.generateAudioFile(line.text, selectedVoice, fileName);

            if (filePath) {
                audioFiles.push(filePath);
                if (member && member.user) {
                    await this.registerUsage(line.text.length, member.user.id, member.user.username, selectedVoice);
                }
            }
        }
        return audioFiles;
    }

    async generateAudioFile(text, voice, fileName) {
        try {
            const mp3 = await openai.audio.speech.create({
                model: "tts-1-hd",
                voice: voice,
                input: text,
            });

            const buffer = Buffer.from(await mp3.arrayBuffer());
            const tempDir = path.join(__dirname, '../../temp_audio');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const filePath = path.join(tempDir, fileName);
            await fs.promises.writeFile(filePath, buffer);
            
            // ניקוי אוטומטי אחרי 5 דקות
            setTimeout(() => {
                if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, (err) => { if (err) log(`[Cleanup] Error: ${err.message}`); });
                }
            }, 300000);

            return filePath;
        } catch (error) {
            log(`❌ [TTS Engine] Error: ${error.message}`);
            return null;
        }
    }

    async registerUsage(charCount, userId, username, voiceProfile) {
        if (charCount <= 0) return;
        try {
            const timestamp = new Date();
            db.collection(USAGE_COLLECTION).add({
                userId, username, characterCount: charCount,
                engine: 'openai-hd', voiceProfile, timestamp
            });

            const userRef = await getUserRef(userId, 'discord');
            await userRef.set({
                stats: { aiCharsUsed: admin.firestore.FieldValue.increment(charCount) },
                meta: { lastActive: timestamp.toISOString() }
            }, { merge: true });
        } catch (e) { log(`[TTS Quota] Error: ${e.message}`); }
    }

    getRandomVoice(character) {
        const pool = VOICE_POOLS[character] || VOICE_POOLS.narrator;
        return pool[Math.floor(Math.random() * pool.length)];
    }
}

module.exports = new OpenAITTS();