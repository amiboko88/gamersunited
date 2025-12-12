// 📁 tts/ttsEngine.openai.js (שם הקובץ נשאר ttsEngine.elevenlabs.js אצלך)
const { OpenAI } = require('openai');
const { log } = require('../utils/logger.js');
const { registerTTSUsage } = require('./ttsQuotaManager.eleven.js');

let openai;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; 

if (OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
    });
    log('🔊 [OpenAI Engine] הלקוח של OpenAI אותחל בהצלחה.');
} else {
    log('⚠️ [OpenAI Engine] משתנה הסביבה OPENAI_API_KEY לא נמצא. המנוע מושבת.');
}

// --- הגדרות קולות דינמיות ---
const SHIMON_VOICE = 'ash'; // ✅ [שדרוג] הוחלף ל-Ash
const SHIRLY_VOICES = ['alloy', 'shimmer', 'nova']; // ✅ [שדרוג] מאגר קולות לשירלי

// --- הגדרת אישיות (System Instructions) ---
const PERSONALITY = {
    shimon: 'Speak in a deep, cynical, slightly impatient, and rude tone. You are a tired gamer who has seen too much failure.',
    shirly: 'Speak in a very flirtatious, lively, energetic, and slightly sexy tone. You are amused and playful.', // ✅ [שדרוג] טון סקסי וחי
    shimon_calm: 'Speak in a very calm, slow, and relaxed tone.',
    shimon_energetic: 'Speak in an energetic, excited, and fast-paced tone.'
};

/**
 * ממיר Stream ל-Buffer (גרסה מעודכנת עבור OpenAI)
 */
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', (error) => {
            log(`❌ [streamToBuffer] שגיאה באיסוף ה-Stream: ${error.message}`);
            reject(error);
        });
    });
}

/**
 * מייצר אודיו בודד מטקסט (עבור פקודות רגילות).
 */
async function synthesizeTTS(text, profileName = 'shimon_calm', member = null) {
    if (!openai) {
        log('❌ [OpenAI Engine] ניסיון להשתמש במנוע TTS כאשר הלקוח אינו מאותחל.');
        return null;
    }
    
    let voice = SHIMON_VOICE;
    let instructions = PERSONALITY.shimon_calm;

    // התאמת קול והוראות לפי הפרופיל
    if (profileName === 'shimon_energetic') {
        instructions = PERSONALITY.shimon_energetic;
    } else if (profileName === 'shirly') {
        // בחירה רנדומלית לקול של שירלי גם ב-TTS רגיל
        voice = SHIRLY_VOICES[Math.floor(Math.random() * SHIRLY_VOICES.length)];
        instructions = PERSONALITY.shirly;
    }

    const cleanText = text.replace(/[*_~`]/g, '');
    
    try {
        log(`[OpenAI Engine] מייצר אודיו (${profileName}): "${cleanText}"`);
        
        const response = await openai.audio.speech.create({
            model: 'gpt-4o-mini-tts', // או tts-1-hd אם תרצה איכות גבוהה יותר
            voice: voice,
            input: cleanText,
            response_format: 'mp3',
            instructions: instructions 
        });
        
        const audioBuffer = await streamToBuffer(response.body);

        const userId = member ? member.id : 'system';
        const username = member ? member.displayName : 'System';
        await registerTTSUsage(cleanText.length, userId, username, 'OpenAI', profileName);

        return audioBuffer;

    } catch (error) {
        log(`❌ [OpenAI Engine] שגיאה קריטית בייצור קול: ${error.message}`);
        return null;
    }
}

/**
 * מייצר שיחה שלמה (פודקאסט) מסקריפט.
 */
async function synthesizeConversation(script, member) {
    if (!openai) {
        log(`❌ [OpenAI Engine] ניסיון להשתמש במנוע TTS (שיחה) כאשר הלקוח אינו מאותחל.`);
        return [];
    }
    
    const audioBuffers = [];
    const userId = member.id;
    const username = member.displayName;

    // ✅ [שדרוג] בחירת קול קבוע לשירלי *לכל השיחה הנוכחית* (כדי שלא תחליף קול באמצע משפט)
    const currentShirlyVoice = SHIRLY_VOICES[Math.floor(Math.random() * SHIRLY_VOICES.length)];
    log(`[OpenAI Podcast] הקול הנבחר לשירלי בשיחה זו: ${currentShirlyVoice}`);

    for (const line of script) {
        if (!line.speaker || !line.text) continue;

        const cleanText = line.text.replace(/[*_~`]/g, '');
        const speakerKey = line.speaker.toLowerCase();
        
        // הגדרת קול והוראות לפי הדובר
        let voice = SHIMON_VOICE;
        let instructions = PERSONALITY.shimon;

        if (speakerKey === 'shirly') {
            voice = currentShirlyVoice;
            instructions = PERSONALITY.shirly;
        }

        try {
            log(`[OpenAI Podcast] מייצר שורה: [${speakerKey}/${voice}] - "${cleanText}"`);

            const response = await openai.audio.speech.create({
                model: 'gpt-4o-mini-tts',
                voice: voice,
                input: cleanText,
                response_format: 'mp3',
                instructions: instructions
            });
            
            const audioBuffer = await streamToBuffer(response.body);
            audioBuffers.push(audioBuffer);

            await registerTTSUsage(cleanText.length, userId, username, 'OpenAI-Podcast', speakerKey);

        } catch (error) {
            log(`❌ [OpenAI Podcast] שגיאה בייצור שורה: ${error.message}`);
        }
    }
    
    log(`[OpenAI Podcast] יצירת השיחה עבור ${username} הסתיימה. ${audioBuffers.length} קטעי אודיו נוצרו.`);
    return audioBuffers;
}

module.exports = {
    synthesizeConversation,
    synthesizeTTS,
};