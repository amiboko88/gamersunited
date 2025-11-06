// 📁 tts/ttsEngine.elevenlabs.js
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
const { log } = require('../utils/logger.js');
const { registerTTSUsage, getElevenLabsQuota } = require('./ttsQuotaManager.eleven.js');
const { Readable } = require('stream');

let elevenLabs;

const SHIMON_VOICE_ID = 'txHtK15K5KtX959ZtpRa'; // ⬅️ הקול המשובט שלך
const SHIRLY_VOICE_ID = 'tnSpp4vdxKPjI9w0GnoV'; // ⬅️ ה-ID של שירלי

if (process.env.ELEVEN_API_KEY) { 
    elevenLabs = new ElevenLabsClient({ 
        apiKey: process.env.ELEVEN_API_KEY, 
    });
    log('🔊 [ElevenLabs Engine] הלקוח של ElevenLabs אותחל בהצלחה.');
    getElevenLabsQuota()
        .then(quota => {
            if (quota) {
                 // ✅ [תיקון] עדכון הלוג להצגת קרדיטים
                log(`[ElevenLabs Quota] מצב מכסה: ${quota.used} / ${quota.total} ${quota.unit}. (${quota.percentUsed}%)`);
            }
        })
        .catch(err => {
            log(`❌ [ElevenLabs Quota] שגיאה בבדיקת מכסה ראשונית: ${err.message}`);
        });

} else {
    log('⚠️ [ElevenLabs Engine] משתנה הסביבה ELEVEN_API_KEY לא נמצא. המנוע מושבת.');
}


// --- הגדרת פרופילים מבוססי סגנון עם IDs נפרדים ---
const VOICE_CONFIG = {
    // --- קולות לפודקאסט ---
    shimon: {
        id: SHIMON_VOICE_ID, 
        settings: { stability: 0.5, similarity_boost: 0.75 }
    },
    shirly: {
        id: SHIRLY_VOICE_ID, 
        settings: { stability: 0.4, similarity_boost: 0.75, style_exaggeration: 0.2 }
    },
    
    // --- פרופילים סטטיים לפקודת /tts (מבוססים על הקול שלך) ---
    shimon_calm: {
        id: SHIMON_VOICE_ID,
        settings: { stability: 0.75, similarity_boost: 0.75 }
    },
    shimon_energetic: {
        id: SHIMON_VOICE_ID,
        settings: { stability: 0.30, similarity_boost: 0.7, style_exaggeration: 0.5 }
    },
};

const DEFAULT_PROFILE = VOICE_CONFIG.shimon;
// -----------------------------------------------------------------


async function streamToBuffer(stream) {
    const chunks = [];
    try {
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    } catch (error) {
        log(`❌ [streamToBuffer] שגיאה באיסוף ה-Stream: ${error.message}`);
        throw error;
    }
}

async function synthesizeTTS(text, profileName = 'shimon_calm', member = null) {
    if (!elevenLabs) {
        log('❌ [ElevenLabs Engine] ניסיון להשתמש במנוע TTS כאשר הלקוח אינו מאותחל.');
        return null;
    }
    
    const profile = VOICE_CONFIG[profileName] || DEFAULT_PROFILE;
        
    const cleanText = text.replace(/[*_~`]/g, '');
    
    try {
        log(`[ElevenLabs Engine] מייצר אודיו עבור: "${cleanText}" עם פרופיל ${profileName}`);
        
        const audioStream = await elevenLabs.textToSpeech.stream(
            profile.id, 
            {           
                text: cleanText,
                model_id: 'eleven_multilingual_v3',
                output_format: 'mp3_44100_128',
                ...profile.settings 
            }
        );

        const audioBuffer = await streamToBuffer(audioStream);

        const userId = member ? member.id : 'system';
        const username = member ? member.displayName : 'System';
        await registerTTSUsage(cleanText.length, userId, username, 'ElevenLabs', profileName);

        return audioBuffer;

    } catch (error) {
        log(`❌ [ElevenLabs Engine] שגיאה קריטית בייצור קול: ${error.message}`);
        log(error); 
        return null;
    }
}

async function synthesizeConversation(script, member) {
    if (!elevenLabs) {
        log(`❌ [ElevenLabs Engine] ניסיון להשתמש במנוע TTS (שיחה) כאשר הלקוח אינו מאותחל. (מפתח: ${process.env.ELEVEN_API_KEY ? 'קיים' : 'חסר'})`);
        return [];
    }
    
    if (SHIRLY_VOICE_ID === 'ID_נשי_מעברית_להדביק_כאן') {
        log('❌ [ElevenLabs Podcast] לא ניתן להתחיל פודקאסט. ה-Voice ID של שירלי חסר בקוד.');
        return []; 
    }

    const audioBuffers = [];
    const userId = member.id;
    const username = member.displayName;

    for (const line of script) {
        if (!line.speaker || !line.text) continue;

        const cleanText = line.text.replace(/[*_~`]/g, '');
        const profileName = line.speaker.toLowerCase();
        const profile = VOICE_CONFIG[profileName] || DEFAULT_PROFILE;

        try {
            log(`[ElevenLabs Podcast] מייצר שורה: [${profileName}] - "${cleanText}"`);

            const audioStream = await elevenLabs.textToSpeech.stream(
                profile.id,
                {
                    text: cleanText,
                    model_id: 'eleven_multilingual_v3',
                    output_format: 'mp3_44100_128',
                    ...profile.settings
                }
            );
            
            const audioBuffer = await streamToBuffer(audioStream);
            audioBuffers.push(audioBuffer);

            await registerTTSUsage(cleanText.length, userId, username, 'ElevenLabs-Podcast', profileName);

        } catch (error) {
            log(`❌ [ElevenLabs Podcast] שגיאה בייצור שורה: ${error.message}`);
            log(error); 
        }
    }
    
    log(`[ElevenLabs Podcast] יצירת השיחה עבור ${username} הסתיימה. ${audioBuffers.length} קטעי אודיו נוצרו.`);
    return audioBuffers;
}

module.exports = {
    synthesizeConversation,
    synthesizeTTS,
};