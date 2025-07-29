// 📁 tts/ttsEngine.elevenlabs.js

const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const { log } = require('../utils/logger.js');
const { registerTTSUsage } = require('./ttsQuotaManager.eleven.js');

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

// --- פרופילי דיבור מתקדמים ---
const SPEECH_PROFILES = {
    shimon_calm: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-C' }, audioConfig: { speakingRate: 1.0, pitch: 0.0 } },
    shimon_energetic: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-C' }, audioConfig: { speakingRate: 1.1, pitch: 1.2 } },
    shimon_serious: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-D' }, audioConfig: { speakingRate: 0.95, pitch: -1.0 } },
    shirly_calm: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-A' }, audioConfig: { speakingRate: 1.0, pitch: 0.0 } },
    shirly_happy: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-A' }, audioConfig: { speakingRate: 1.05, pitch: 1.4 } },
    shirly_dramatic: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-B' }, audioConfig: { speakingRate: 0.9, pitch: -0.5 } },
};

/**
 * הפונקציה המרכזית להפקת קול, כולל דיווח למנהל המכסות.
 * @param {string} text - הטקסט להקראה.
 * @param {string} profileName - שם הפרופיל לשימוש.
 * @param {import('discord.js').GuildMember} member - המשתמש שהפעיל את הפעולה (עבור הדיווח).
 * @returns {Promise<Buffer>}
 */
async function synthesizeGoogleTTS(text, profileName = 'shimon_calm', member = null) {
    if (!googleTtsClient) throw new Error('הלקוח של Google TTS אינו מאותחל.');

    const profile = SPEECH_PROFILES[profileName] || SPEECH_PROFILES.shimon_calm;
    const cleanText = text.replace(/[*_~`]/g, '');
    const ssmlText = `<speak>${cleanText.replace(/,/g, '<break time="300ms"/>').replace(/\./g, '<break time="500ms"/>')}</speak>`;
    
    const request = {
        input: { ssml: ssmlText },
        voice: profile.voice,
        audioConfig: { ...profile.audioConfig, audioEncoding: 'MP3' },
    };

    log(`🎙️ [Google TTS] מפיק קול | פרופיל: ${profileName} | טקסט: "${cleanText}"`);
    
    try {
        const [response] = await googleTtsClient.synthesizeSpeech(request);
        const audioBuffer = response.audioContent;

        if (!audioBuffer || audioBuffer.length < 1024) {
            throw new Error('Google TTS החזיר קובץ שמע ריק או פגום.');
        }
        
        const userId = member ? member.id : 'system';
        const username = member ? member.displayName : 'System';
        await registerTTSUsage(cleanText.length, userId, username, 'Google', profileName);

        return audioBuffer;
    } catch (error) {
        log.error(`❌ [Google TTS] שגיאה בבקשה ל-API של גוגל עבור הטקסט "${cleanText}":`, error);
        throw error;
    }
}

async function getShortTTSByProfile(member) {
    const { getLineForUser } = require('../data/fifoLines.js');
    const text = getLineForUser(member.id, member.displayName);
    const profiles = ['shimon_calm', 'shimon_energetic', 'shimon_serious'];
    const randomProfile = profiles[Math.floor(Math.random() * profiles.length)];
    return await synthesizeGoogleTTS(text, randomProfile, member);
}

async function canUserUseTTS() { return true; }

module.exports = {
    synthesizeTTS: synthesizeGoogleTTS,
    getShortTTSByProfile,
    canUserUseTTS,
};