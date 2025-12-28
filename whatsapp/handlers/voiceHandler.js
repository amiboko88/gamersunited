const axios = require('axios');
const { log } = require('../../utils/logger');

const API_KEY = process.env.ELEVEN_API_KEY; 
const VOICE_ID = 'txHtK15K5KtX959ZtpRa'; // ה-ID של הקול המשוכפל שלך

// ✅ מודל Eleven v3 (Alpha) - המודל האקספרסיבי החדש
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
                // ✅ הגדרות נקיות לפי התמונה ששלחת
                voice_settings: {
                    stability: 0.35, 

                }
            },
            {
                headers: {
                    'xi-api-key': API_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg' // דורשים קובץ MP3
                },
                responseType: 'arraybuffer' // מקבלים את הקובץ הבינארי
            }
        );

        log('[Voice] ✅ Audio generated successfully.');
        return Buffer.from(response.data);

    } catch (error) {
        // מציג שגיאה מפורטת מה-API כדי שנדע אם חסר משהו
        const errorMsg = error.response?.data 
            ? JSON.parse(Buffer.from(error.response.data).toString()) 
            : error.message;
        console.error('[Voice Error]', errorMsg);
        return null;
    }
}

module.exports = { generateVoiceNote };