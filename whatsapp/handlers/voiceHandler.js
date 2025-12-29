const axios = require('axios');
const { log } = require('../../utils/logger');

const API_KEY = process.env.ELEVEN_API_KEY; 
const VOICE_ID = 'txHtK15K5KtX959ZtpRa'; // הקול של שמעון
const MODEL_ID = 'eleven_v3'; // מודל טורבו v3 (מהיר ואיכותי)

const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

async function generateVoiceNote(text) {
    if (!API_KEY) {
        console.error('[Voice] ❌ Missing ELEVEN_API_KEY in .env');
        return null;
    }

    // ניקוי טקסט לא קריא (אמוג'ים וכו' שיכולים לשבור את ה-TTS)
    const cleanText = text.replace(/[*_~`]/g, '');

    log(`[Voice] 🗣️ Generating audio using ${MODEL_ID}...`);

    try {
        const response = await axios.post(
            ELEVENLABS_URL,
            {
                text: cleanText,
                model_id: MODEL_ID, 
                voice_settings: {
                    stability: 0.5, 
                    similarity_boost: 0.8, 
                    style: 0.0,
                    use_speaker_boost: true
                }
            },
            {
                headers: {
                    'xi-api-key': API_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg' // מקבלים MP3
                },
                responseType: 'arraybuffer' // חובה בשביל לשמור כקובץ
            }
        );

        log('[Voice] ✅ Audio generated successfully.');
        return Buffer.from(response.data);

    } catch (error) {
        console.error('[Voice] ❌ Error:', error.response?.data ? JSON.parse(Buffer.from(error.response.data).toString()) : error.message);
        return null;
    }
}

module.exports = { generateVoiceNote };