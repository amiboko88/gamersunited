const axios = require('axios');
const { log } = require('../../utils/logger');

// User provided: AIzaSyABShP0YL8UBsvIntospD6Ce8BppRZtR6Y
// We use a hardcoded key if ENV is missing, as per user direct instruction in chat.
const GOOGLE_API_KEY = process.env.GOOGLE_AI_KEY || 'AIzaSyABShP0YL8UBsvIntospD6Ce8BppRZtR6Y';
const MODEL_NAME = 'gemini-2.0-flash'; // Using Flash as it's often the multimodal default, but we can try 2.5-pro if needed.
// Note: REST Endpoint for generateContent with audio modality.

class GoogleTTS {
    /**
     * Synthesize speech using Google Gemini API
     * @param {string} text - The text to speak
     * @param {string} voiceName - 'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede'
     * @returns {Promise<Buffer|null>} Audio buffer (MP3/WAV)
     */
    async speak(text, voiceName = 'Puck') {
        try {
            log(`🗣️ [Google TTS] Generating audio for: "${text.substring(0, 20)}..." (Voice: ${voiceName})`);

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GOOGLE_API_KEY}`;

            const payload = {
                contents: [{
                    parts: [{ text: text }]
                }],
                generationConfig: {
                    responseModality: "AUDIO",
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: voiceName
                            }
                        }
                    }
                }
            };

            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json' },
                responseType: 'json' // We expect JSON containing base64 audio
            });

            // Parse response structure: candidates[0].content.parts[0].inlineData.data (Base64)
            if (response.data &&
                response.data.candidates &&
                response.data.candidates[0] &&
                response.data.candidates[0].content &&
                response.data.candidates[0].content.parts &&
                response.data.candidates[0].content.parts[0].inlineData) {

                const base64Audio = response.data.candidates[0].content.parts[0].inlineData.data;
                return Buffer.from(base64Audio, 'base64');
            } else {
                log(`❌ [Google TTS] Unexpected Response Structure: ${JSON.stringify(response.data).substring(0, 200)}`);
                return null;
            }

        } catch (error) {
            // Log full error details for debugging
            if (error.response) {
                log(`❌ [Google TTS] API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else {
                log(`❌ [Google TTS] Network/Code Error: ${error.message}`);
            }
            return null;
        }
    }
}

module.exports = new GoogleTTS();
