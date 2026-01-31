const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const axios = require('axios');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class VoiceManager {

    constructor() {
        // תמיכה בשמות שהמשתמש הגדיר (ELEVEN_*) בלבד (לבקשת המשתמש)
        this.elevenLabsKey = process.env.ELEVEN_API_KEY;
        this.voiceId = 'txHtK15K5KtX959ZtpRa';
    }

    /**
     * ממיר קובץ שמע לטקסט (Speech to Text) באמצעות Whisper
     * @param {string} filePath נתיב לקובץ השמע המקומי
     */
    async transcribe(filePath) {
        try {
            log(`🎙️ [Voice] Transcribing file: ${filePath}`);
            const response = await openai.audio.transcriptions.create({
                file: fs.createReadStream(filePath),
                model: "whisper-1",
                language: "he" // מנסה למקד לעברית
            });
            return response.text;
        } catch (error) {
            log(`❌ [Voice] Transcription Failed: ${error.message}`);
            return null;
        }
    }

    /**
     * ממיר טקסט לדיבור (Text to Speech) באמצעות ElevenLabs
     * @param {string} text הטקסט להקראה
     * @returns {Promise<Buffer>} ה-Buffer של קובץ השמע
     */
    async speak(text, options = {}) {
        if (!this.elevenLabsKey) {
            log('❌ [Voice] Missing ELEVEN_API_KEY');
            return null;
        }

        const cleanText = text.replace(/[*_~`]/g, '').replace('[VOICE]', '').trim();
        if (!cleanText) return null;

        // Determine Configuration
        // Priority: Options -> Default Class Property -> Hardcoded Fallback
        const voiceId = options.voiceId || this.voiceId;
        const modelId = options.modelId || "eleven_v3"; // ✅ Enforced V3 for Hebrew stability

        // Settings: Allow per-call overrides, otherwise use defaults
        const settings = {
            stability: options.stability !== undefined ? options.stability : 0.5, // V3 Optimized for Hebrew: 0.5
            similarity_boost: options.similarityBoost || 0.8,
            style: options.style || 0.5, // V3 supports style
            use_speaker_boost: options.useSpeakerBoost !== undefined ? options.useSpeakerBoost : true
        };

        try {
            log(`🗣️ [Voice] Generating audio (ElevenLabs)...
            - Text: "${cleanText.substring(0, 20)}..."
            - Voice: ${voiceId}
            - Model: ${modelId}`);

            const response = await axios({
                method: 'POST',
                url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': this.elevenLabsKey,
                    'Content-Type': 'application/json'
                },
                data: {
                    text: cleanText,
                    model_id: modelId,
                    voice_settings: settings
                },
                responseType: 'arraybuffer'
            });

            return Buffer.from(response.data);

        } catch (error) {
            if (error.response && error.response.data) {
                const errMsg = Buffer.isBuffer(error.response.data)
                    ? error.response.data.toString()
                    : JSON.stringify(error.response.data);
                log(`❌ [Voice] TTS Critical Failure (${voiceId}): ${errMsg}`);
                return null;
            } else {
                log(`❌ [Voice] TTS Failed: ${error.message}`);
                return null;
            }
        }
    }
}

module.exports = new VoiceManager();
