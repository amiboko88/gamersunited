const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class OpenAITTS {
    /**
     * Generate speech using OpenAI's TTS model.
     * @param {string} text - The text to speak.
     * @param {string} voice - The voice to use (alloy, echo, fable, onyx, nova, shimmer).
     * @returns {Promise<Buffer|null>} Audio buffer or null on failure.
     */
    async speak(text, voice = 'onyx') {
        try {
            log(`🗣️ [OpenAI TTS] Generating audio for: "${text.substring(0, 20)}..." (Voice: ${voice})`);

            const response = await openai.audio.speech.create({
                model: "tts-1", // Standard optimized model
                voice: voice,
                input: text,
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            return buffer;

        } catch (error) {
            log(`❌ [OpenAI TTS] Failed: ${error.message}`);
            return null;
        }
    }
}

module.exports = new OpenAITTS();
