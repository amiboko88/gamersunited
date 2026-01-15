const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const axios = require('axios');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class VoiceManager {

    constructor() {
        this.elevenLabsKey = process.env.ELEVENLABS_API_KEY;
        this.voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Default to Rachel if missing description
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
    async speak(text) {
        if (!this.elevenLabsKey) {
            log('❌ [Voice] Missing ELEVENLABS_API_KEY');
            return null;
        }

        // ניקוי הטקסט מתגיות פנימיות
        const cleanText = text.replace('[VOICE]', '').trim();
        if (!cleanText) return null;

        try {
            log(`🗣️ [Voice] Generating audio for: "${cleanText.substring(0, 20)}..."`);

            const response = await axios({
                method: 'POST',
                url: `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': this.elevenLabsKey,
                    'Content-Type': 'application/json'
                },
                data: {
                    text: cleanText,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                    }
                },
                responseType: 'arraybuffer'
            });

            return Buffer.from(response.data);

        } catch (error) {
            log(`❌ [Voice] TTS Failed: ${error.message}`);
            return null;
        }
    }
}

module.exports = new VoiceManager();
