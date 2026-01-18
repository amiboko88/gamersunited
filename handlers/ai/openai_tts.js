const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class OpenAITTS {
    async speak(text, voice = 'alloy') {
        try {
            log(`🗣️ [OpenAI TTS] Generating audio for: "${text.substring(0, 20)}..." (Voice: ${voice})`);

            const response = await openai.audio.speech.create({
                model: "tts-1-hd", // High Quality Model
                voice: voice,
                input: text,
                response_format: "mp3" // Discord friendly
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            return buffer;

        } catch (error) {
            log(`❌ [OpenAI TTS] Generation Failed: ${error.message}`);
            return null;
        }
    }
}

module.exports = new OpenAITTS();
