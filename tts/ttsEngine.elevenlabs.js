// 📁 tts/ttsEngine.elevenlabs.js (Google Chirp 3 HD + LINEAR16 + גיוון מלא לשמעון ושירלי)
const axios = require('axios');
const { log } = require('../utils/logger');
const { registerTTSUsage } = require('./ttsQuotaManager.eleven.js');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_TTS_URL = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${GOOGLE_API_KEY}`;

if (GOOGLE_API_KEY) {
    log('🔊 [Google Chirp 3] מפתח API זוהה. מנוע HD (LINEAR16) מוכן.');
} else {
    log('⚠️ [Google Chirp 3] חסר GOOGLE_API_KEY. המנוע מושבת.');
}

// --- מאגר קולות Chirp 3 HD (כוכבים) ---
const VOICE_POOLS = {
    male: [
        'he-IL-Chirp-3-HD-Achird', 
        'he-IL-Chirp-3-HD-Algenib', 
        'he-IL-Chirp-3-HD-Algieba', 
        'he-IL-Chirp-3-HD-Alnilam'
    ],
    female: [
        'he-IL-Chirp-3-HD-Achernar', 
        'he-IL-Chirp-3-HD-Aoede', 
        'he-IL-Chirp-3-HD-Autonoe', 
        'he-IL-Chirp-3-HD-Callirrhoe'
    ]
};

// --- הגדרות אופי (מהירות בלבד) ---
const CHARACTER_SETTINGS = {
    shirly: {
        speakingRate: 0.90 // איטי ורגוע
    },
    shimon: {
        speakingRate: 0.95 // יציב וכבד
    },
    default: {
        speakingRate: 1.0
    }
};

/**
 * בוחר קול רנדומלי מתוך המאגר לפי מגדר
 */
function getRandomVoice(gender) {
    const pool = VOICE_POOLS[gender] || VOICE_POOLS.male;
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * פונקציה ראשית לייצור אודיו (הודעות בודדות)
 */
async function synthesizeTTS(text, profileName = 'shimon', member = null) {
    if (!GOOGLE_API_KEY) return null;

    const cleanText = text.replace(/[*_~`]/g, '');
    let selectedVoice = '';
    
    // זיהוי דמות
    const characterKey = profileName.toLowerCase().includes('shirly') ? 'shirly' : 'shimon';
    const settings = CHARACTER_SETTINGS[characterKey];

    // ✅ [שדרוג] בחירה רנדומלית גם לשמעון וגם לשירלי
    if (characterKey === 'shirly') {
        selectedVoice = getRandomVoice('female');
    } else {
        selectedVoice = getRandomVoice('male'); 
    }

    const requestBody = {
        input: { text: cleanText },
        voice: {
            languageCode: 'he-IL',
            name: selectedVoice
        },
        audioConfig: {
            audioEncoding: 'LINEAR16', // WAV איכותי
            sampleRateHertz: 44100,
            speakingRate: settings.speakingRate 
        }
    };

    try {
        const voiceShortName = selectedVoice.split('-').pop();
        log(`[Google HD] מייצר (${characterKey}): "${cleanText.substring(0, 15)}..." | קול: ${voiceShortName}`);

        const response = await axios.post(GOOGLE_TTS_URL, requestBody);

        if (response.data && response.data.audioContent) {
            const audioBuffer = Buffer.from(response.data.audioContent, 'base64');
            
            if (member) {
                await registerTTSUsage(cleanText.length, member.id, member.displayName, 'Google-Chirp3', selectedVoice);
            }

            return audioBuffer;
        } else {
            throw new Error('התקבלה תשובה ריקה מגוגל.');
        }

    } catch (error) {
        log(`❌ [Google TTS] שגיאה: ${error.response?.data?.error?.message || error.message}`);
        
        if (error.response?.data?.error?.message?.includes('not found')) {
            log('🔄 מנסה גיבוי (Neural2)...');
            return await synthesizeFallback(cleanText, characterKey === 'shirly' ? 'FEMALE' : 'MALE');
        }
        return null;
    }
}

// פונקציית גיבוי
async function synthesizeFallback(text, gender) {
    const fallbackVoice = gender === 'FEMALE' ? 'he-IL-Neural2-A' : 'he-IL-Neural2-B';
    try {
        const response = await axios.post(GOOGLE_TTS_URL, {
            input: { text },
            voice: { languageCode: 'he-IL', name: fallbackVoice },
            audioConfig: { audioEncoding: 'MP3' } 
        });
        return Buffer.from(response.data.audioContent, 'base64');
    } catch (e) {
        return null;
    }
}

/**
 * תמיכה בשיחות (פודקאסט)
 */
async function synthesizeConversation(script, member) {
    const audioBuffers = [];
    
    // ✅ [שדרוג] מגרילים קולות חדשים בתחילת כל פודקאסט
    // זה מבטיח גיוון בין פודקאסטים, אבל עקביות בתוך השיחה עצמה
    const sessionVoices = {
        shimon: getRandomVoice('male'), 
        shirly: getRandomVoice('female') 
    };

    log(`[Podcast] משתתפים: שמעון (${sessionVoices.shimon.split('-').pop()}) | שירלי (${sessionVoices.shirly.split('-').pop()})`);

    for (const line of script) {
        if (!line.speaker || !line.text) continue;
        
        const isShirly = line.speaker.toLowerCase().includes('shirly');
        const currentVoice = isShirly ? sessionVoices.shirly : sessionVoices.shimon;
        const settings = isShirly ? CHARACTER_SETTINGS.shirly : CHARACTER_SETTINGS.shimon;
        
        const requestBody = {
            input: { text: line.text.replace(/[*_~`]/g, '') },
            voice: { languageCode: 'he-IL', name: currentVoice },
            audioConfig: { 
                audioEncoding: 'LINEAR16', 
                sampleRateHertz: 44100,
                speakingRate: settings.speakingRate
            }
        };

        try {
            const response = await axios.post(GOOGLE_TTS_URL, requestBody);
            if (response.data.audioContent) {
                audioBuffers.push(Buffer.from(response.data.audioContent, 'base64'));
            }
        } catch (error) {
            log(`❌ שגיאה בשורה של ${line.speaker}: ${error.message}`);
        }
    }
    
    return audioBuffers;
}

module.exports = {
    synthesizeTTS,
    synthesizeConversation
};