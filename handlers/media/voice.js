// 📁 handlers/media/voice.js
const axios = require('axios');
const API_KEY = process.env.ELEVEN_API_KEY;
const VOICE_ID = 'txHtK15K5KtX959ZtpRa';

async function textToSpeech(text, specificVoiceId = null) {
    if (!API_KEY) return null;
    try {
        const targetVoice = specificVoiceId || VOICE_ID; // השימוש בקול ספציפי או ברירת המחדל (שמעון)
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}`,
            {
                text: text.replace(/[*_~`]/g, ''),
                // מודל: V3 (לפי בקשתך - עובד הכי טוב עם עברית אצלך)
                model_id: 'eleven_v3', // Updated to explicit V3 ID
                voice_settings: {
                    // Stability: המחוון באתר בין Robust ל-Creative.
                    // 0.3 = די Creative (הרבה רגש, פחות יציב). מתאים ל"פה מלוכלך".
                    stability: 0.3,

                    // Similarity: כמה הוא נצמד לקול המקורי.
                    similarity_boost: 0.8,

                    style: 0.5,             // מוסיף אקסטרה סטייל (אם נתמך ב-V3)
                    use_speaker_boost: true
                }
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