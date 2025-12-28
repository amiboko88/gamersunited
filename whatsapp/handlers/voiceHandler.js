const axios = require('axios');
const { log } = require('../../utils/logger');

const API_KEY = process.env.ELEVEN_API_KEY; 
const VOICE_ID = 'txHtK15K5KtX959ZtpRa'; 

const MODEL_ID = 'eleven_v3'; 

const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

async function generateVoiceNote(text) {
    if (!API_KEY) {
        console.error('[Voice] ❌ Missing ELEVEN_API_KEY in .env');
        return null;
    }

    log(`[Voice] 🗣️ Generating audio using ${MODEL_ID}...`);

    try {
        const response = await axios.post(
            ELEVENLABS_URL,
            {
                text: text,
                model_id: MODEL_ID, 
                // ✅ תיקון קריטי לפי הלוג שלך: חייב להיות 0.0, 0.5 או 1.0 בלבד!
                voice_settings: {
                    stability: 0.5, // 0.5 = Natural (הכי בטוח והכי אנושי)
                    similarity_boost: 0.8, // חובה להוסיף את זה כדי שיישמע כמו הקול המקורי
                    style: 0.0,
                    use_speaker_boost: true
                }
            },
            {
                headers: {
                    'xi-api-key': API_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg'
                },
                responseType: 'arraybuffer'
            }
        );

        log('[Voice] ✅ Audio generated successfully.');
        return Buffer.from(response.data);

    } catch (error) {
        const errorMsg = error.response?.data 
            ? JSON.parse(Buffer.from(error.response.data).toString()) 
            : error.message;
        console.error('[Voice Error]', errorMsg);
        return null;
    }
}

module.exports = { generateVoiceNote };