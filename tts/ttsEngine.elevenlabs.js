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

// --- ✨ שדרוג: הגדרות קול דינמיות במקום פרופילים קבועים ---
const VOICE_CONFIG = {
    shimon: {
        voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-C' },
        pitchRange: [-1.0, 2.0],
        rateRange: [0.95, 1.15],
    },
    shirly: {
        voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-A' },
        pitchRange: [-0.5, 1.5],
        rateRange: [1.0, 1.2],
    }
};

/**
 * יוצר וריאציית קול אקראית על בסיס הגדרות.
 * @param {string} speaker - 'shimon' or 'shirly'
 * @returns {object}
 */
function createDynamicVoiceProfile(speaker) {
    const config = VOICE_CONFIG[speaker.toLowerCase()] || VOICE_CONFIG.shimon;
    const pitch = Math.random() * (config.pitchRange[1] - config.pitchRange[0]) + config.pitchRange[0];
    const speakingRate = Math.random() * (config.rateRange[1] - config.rateRange[0]) + config.rateRange[0];
    
    return {
        voice: config.voice,
        audioConfig: { speakingRate, pitch }
    };
}

/**
 * פונקציה מרכזית חדשה: מייצרת שיחה שלמה עם "מצב רוח" מתפתח.
 * @param {object[]} script - מערך של שורות הסקריפט.
 * @param {import('discord.js').GuildMember} member - המשתמש שהפעיל את הפעולה.
 * @returns {Promise<Buffer[]>}
 */
async function synthesizeConversation(script, member) {
    if (!googleTtsClient) throw new Error('הלקוח של Google TTS אינו מאותחל.');

    const audioBuffers = [];
    let conversationTension = 0.0; // "מתח" השיחה, יתפתח לאורך הסקריפט

    for (const line of script) {
        if (!line.speaker || !line.text) continue; // הגנה מפני שורות ריקות

        const dynamicProfile = createDynamicVoiceProfile(line.speaker);
        dynamicProfile.audioConfig.pitch += conversationTension; // התאמת הקול ל"מתח" השיחה
        
        const cleanText = line.text.replace(/[*_~`]/g, '');
        const ssmlText = `<speak>${cleanText.replace(/,/g, '<break time="300ms"/>').replace(/\./g, '<break time="500ms"/>')}</speak>`;

        const request = {
            input: { ssml: ssmlText },
            voice: dynamicProfile.voice,
            audioConfig: { ...dynamicProfile.audioConfig, audioEncoding: 'MP3' },
        };
        
        try {
            const [response] = await googleTtsClient.synthesizeSpeech(request);
            audioBuffers.push(response.audioContent);
            conversationTension += 0.2; // העלאת המתח לקראת השורה הבאה
            
            const profileName = `${line.speaker.toLowerCase()}_dynamic`;
            await registerTTSUsage(cleanText.length, member.id, member.displayName, 'Google', profileName);
        } catch (error) {
            log.error(`❌ [Google TTS] שגיאה בייצור קול עבור: "${cleanText}"`, error);
        }
    }
    return audioBuffers;
}

// הפונקציה הישנה נשארת לתאימות עם חלקים אחרים במערכת
async function synthesizeTTS(text, profileName = 'shimon_calm', member = null) {
    // קוד זה יכול לשמש לפונקציות אחרות שצריכות קול יחיד ולא שיחה שלמה
    const staticProfiles = {
        shimon_calm: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-C' }, audioConfig: { speakingRate: 1.0, pitch: 0.0 } },
        shimon_energetic: { voice: { languageCode: 'he-IL', name: 'he-IL-Wavenet-C' }, audioConfig: { speakingRate: 1.1, pitch: 1.2 } },
    };
    const profile = staticProfiles[profileName] || staticProfiles.shimon_calm;
    const cleanText = text.replace(/[*_~`]/g, '');
    const ssmlText = `<speak>${cleanText}</speak>`;
    const request = {
        input: { ssml: ssmlText },
        voice: profile.voice,
        audioConfig: { ...profile.audioConfig, audioEncoding: 'MP3' },
    };
    const [response] = await googleTtsClient.synthesizeSpeech(request);
    const userId = member ? member.id : 'system';
    const username = member ? member.displayName : 'System';
    await registerTTSUsage(cleanText.length, userId, username, 'Google', profileName);
    return response.audioContent;
}

module.exports = {
    synthesizeConversation,
    synthesizeTTS,
};