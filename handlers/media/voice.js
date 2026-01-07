// 📁 handlers/media/voice.js
const axios = require('axios');
const API_KEY = process.env.ELEVEN_API_KEY; 
const VOICE_ID = 'txHtK15K5KtX959ZtpRa'; 

async function textToSpeech(text) {
    if (!API_KEY) return null;
    try {
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
            {
                text: text.replace(/[*_~`]/g, ''),
                model_id: 'eleven_v3', 
                voice_settings: { stability: 0.5, similarity_boost: 0.8 }
            },
            {
                headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
                responseType: 'arraybuffer'
            }
        );
        return Buffer.from(response.data);
    } catch (error) {
        console.error('TTS Error:', error.message);
        return null;
    }
}

module.exports = { textToSpeech };