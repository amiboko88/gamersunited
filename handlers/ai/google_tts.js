const axios = require('axios');
const { log } = require('../../utils/logger');

// User provided key was leaked. Switching to strictly ENV (GEMINI_STUDIO_AI) as requested.
const GOOGLE_API_KEY = process.env.GEMINI_STUDIO_AI; // ⚠️ API KEY REQUIRED IN ENV
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
                    parts: [{ text: `Please generate speech for the following text: "${text}"` }]
                }],
                generationConfig: {
                    // Optimized for Hebrew
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: voiceName
                            }
                        }
                    }
                }
            };

            // Note: explicit languageCode is not always available in this beta endpoint struct, 
            // but the model detects language from text. 
            // To improve Hebrew, ensure input text is clean Hebrew.

            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json' },
                responseType: 'json'
            });

            if (response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
                const base64Audio = response.data.candidates[0].content.parts[0].inlineData.data;
                return Buffer.from(base64Audio, 'base64');
            } else {
                log(`❌ [Google TTS] Unexpected Response: ${JSON.stringify(response.data).substring(0, 200)}`);
                return null;
            }

        } catch (error) {
            if (error.response) {
                // Handle Specific Errors
                if (error.response.status === 429) {
                    log(`⚠️ [Google TTS] Quota Exceeded (Free Tier). Upgrade to Paid or wait.`);
                } else if (error.response.status === 403) {
                    log(`❌ [Google TTS] Auth Error. Check GEMINI_STUDIO_AI variable.`);
                } else {
                    log(`❌ [Google TTS] API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
                }
            } else {
                log(`❌ [Google TTS] Network/Code Error: ${error.message}`);
            }
            return null;
        }

    }

}

module.exports = new GoogleTTS();
