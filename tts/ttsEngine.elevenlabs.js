// 📁 handlers/tts/ttsEngine.elevenlabs.js (עכשיו מנוע גוגל)

const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const { log } = require('../../utils/logger');

let googleTtsClient;
const googleCredentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;

if (googleCredentialsJson) {
    try {
        const credentials = JSON.parse(googleCredentialsJson);
        googleTtsClient = new TextToSpeechClient({ credentials });
        log('🔊 [Google TTS Engine] הלקוח של גוגל אותחל בהצלחה.');
    } catch (error) {
        log.error('❌ [Google TTS Engine] שגיאה בפענוח GOOGLE_CREDENTIALS_JSON.', error);
    }
} else {
    log('⚠️ [Google TTS Engine] משתנה הסביבה GOOGLE_CREDENTIALS_JSON לא נמצא.');
}

// --- פרופילי דיבור (SSML) ---
const SPEECH_PROFILES = {
    // פרופילים עבור שמעון (קול גברי)
    shimon_calm: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-C' }, audioConfig: { speakingRate: 1.0, pitch: 0.0 } },
    shimon_energetic: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-C' }, audioConfig: { speakingRate: 1.1, pitch: 1.2 } },
    shimon_serious: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-D' }, audioConfig: { speakingRate: 0.95, pitch: -1.0 } },
    
    // פרופילים עבור שירלי (קול נשי)
    shirly_calm: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-A' }, audioConfig: { speakingRate: 1.0, pitch: 0.0 } },
    shirly_happy: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-A' }, audioConfig: { speakingRate: 1.05, pitch: 1.4 } },
    shirly_dramatic: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-B' }, audioConfig: { speakingRate: 0.9, pitch: -0.5 } },
};

/**
 * הפונקציה המרכזית להפקת קול באמצעות Google TTS עם יכולות מתקדמות.
 * @param {string} text - הטקסט להקראה.
 * @param {string} profileName - שם הפרופיל לשימוש (למשל, 'shimon_energetic').
 * @returns {Promise<Buffer>} - באפר של קובץ השמע.
 */
async function synthesizeGoogleTTS(text, profileName = 'shimon_calm') {
    if (!googleTtsClient) throw new Error('הלקוח של Google TTS לא אותחל.');

    const profile = SPEECH_PROFILES[profileName] || SPEECH_PROFILES.shimon_calm;
    const cleanText = text.replace(/[*_~`]/g, '');

    // המרה ל-SSML לשליטה מלאה: הוספת פאוזות טבעיות והדגשת מילים בסיסית
    const ssmlText = `<speak>${cleanText
        .replace(/\?/g, '?<break time="600ms"/>')
        .replace(/\./g, '.<break time="500ms"/>')
        .replace(/,/g, ',<break time="300ms"/>')
    }</speak>`;
    
    const request = {
        input: { ssml: ssmlText },
        voice: profile.voice,
        audioConfig: { ...profile.audioConfig, audioEncoding: 'MP3' },
    };

    log(`🎙️ [Google TTS] מפיק קול | פרופיל: ${profileName} | טקסט: "${cleanText}"`);
    
    try {
        const [response] = await googleTtsClient.synthesizeSpeech(request);
        return response.audioContent;
    } catch (error) {
        log.error(`❌ [Google TTS] שגיאה בבקשה ל-API של גוגל:`, error);
        throw error;
    }
}

// --- פונקציות תאימות למבנה הקוד הקיים ---
async function getShortTTSByProfile(member) {
    const { getLineForUser } = require('../data/fifoLines');
    const text = getLineForUser(member.id, member.displayName);
    const profiles = ['shimon_calm', 'shimon_energetic', 'shimon_serious'];
    const randomProfile = profiles[Math.floor(Math.random() * profiles.length)];
    return await synthesizeGoogleTTS(text, randomProfile);
}

// פונקציה זו נשארת לצורך תאימות, תמיד מחזירה true
async function canUserUseTTS() {
    return true;
}

// ייצוא הפונקציות עם שמות גנריים כדי להקל על המעבר
module.exports = {
    synthesizeTTS: synthesizeGoogleTTS,
    getShortTTSByProfile,
    canUserUseTTS,
};