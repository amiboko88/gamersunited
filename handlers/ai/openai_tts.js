const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class OpenAITTS {
    constructor() {
        this.voiceMap = {
            'shimon': 'onyx',   // Deep, Authoritative
            'shirly': 'shimmer' // Clear, Expressive
        };
    }

    /**
     * Generate Speech using OpenAI tts-1-hd
     * @param {string} text - The text to speak
     * @param {string} persona - 'shimon' or 'shirly'
     * @returns {Promise<Buffer|null>} Audio buffer
     */
    async speak(text, persona = 'shimon') {
        try {
            const voice = this.voiceMap[persona] || 'alloy';
            log(`🗣️ [OpenAI TTS] Generating (${voice}): "${text.substring(0, 20)}..."`);

            const mp3 = await openai.audio.speech.create({
                model: "tts-1-hd",
                voice: voice,
                input: text,
                response_format: "mp3"
            });

            const buffer = Buffer.from(await mp3.arrayBuffer());
            return buffer;

        } catch (error) {
            log(`❌ [OpenAI TTS] Error: ${error.message}`);
            return null;
        }
    }
}

module.exports = new OpenAITTS();
