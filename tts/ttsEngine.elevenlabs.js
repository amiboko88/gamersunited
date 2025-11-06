// 📁 tts/ttsEngine.elevenlabs.js
const { ElevenLabs } = require('@elevenlabs/elevenlabs-js');
const { log } = require('../utils/logger.js');
const { registerTTSUsage, getElevenLabsQuota } = require('./ttsQuotaManager.eleven.js');
const { Readable } = require('stream');

let elevenLabs;

// --- הפרדת מזהי קולות ---
const SHIMON_VOICE_ID = 'txHtK15K5KtX959ZtpRa'; // ⬅️ הקול המשובט שלך
const SHIRLY_VOICE_ID = 'tnSpp4vdxKPjI9w0GnoV'; // ⬅️ הדבק כאן את ה-ID של הקול הנשי שבחרת
// ----------------------------------------------------

// ✅ [תיקון] הוחלף לשם משתנה הסביבה הנכון
if (process.env.ELEVEN_API_KEY) { 
    elevenLabs = new ElevenLabs({
        apiKey: process.env.ELEVEN_API_KEY, // ✅ [תיקון]
    });
    log('🔊 [ElevenLabs Engine] הלקוח של ElevenLabs אותחל בהצלחה.');
    getElevenLabsQuota()
        .then(quota => {
            if (quota) {
                log(`[ElevenLabs Quota] מצב מכסה: ${quota.used} / ${quota.total} תווים. (${quota.percentUsed}%)`);
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
    // "שמעון" - הקריין הראשי, יציב יחסית
    shimon: {
        id: SHIMON_VOICE_ID, // ⬅️ משתמש בקול שלך
        settings: {
            stability: 0.5, // ערך מאוזן
            similarity_boost: 0.75,
        }
    },
    // "שירלי" - השותפה, קצת יותר אקספרסיבית
    shirly: {
        id: SHIRLY_VOICE_ID, // ⬅️ משתמש בקול הנשי
        settings: {
            stability: 0.4, // פחות יציב = יותר אקספרסיבי
            similarity_boost: 0.75,
            style_exaggeration: 0.2
        }
    },
    
    // --- פרופילים סטטיים לפקודת /tts (מבוססים על הקול שלך) ---
    shimon_calm: {
        id: SHIMON_VOICE_ID,
        settings: {
            stability: 0.75, // יציבות גבוהה = קול רגוע ומונוטוני
            similarity_boost: 0.75,
        }
    },
    shimon_energetic: {
        id: SHIMON_VOICE_ID,
        settings: {
            stability: 0.30, // יציבות נמוכה = קול אנרגטי ודינמי
            similarity_boost: 0.7,
            style_exaggeration: 0.5 // הגזמה של הסגנון
        }
    },
};

// הגדרת ברירת מחדל אם נשלח פרופיל לא קיים (יהיה הקול שלך)
const DEFAULT_PROFILE = VOICE_CONFIG.shimon;
// -----------------------------------------------------------------


/**
 * ממיר Stream ל-Buffer
 * @param {Readable} stream 
 * @returns {Promise<Buffer>}
 */
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', (error) => reject(error));
    });
}

/**
 * מייצר אודיו בודד מטקסט.
 * @param {string} text - הטקסט להקראה
 * @param {string} profileName - שם הפרופיל (למשל 'shimon_calm')
 * @param {import('discord.js').GuildMember} member - המשתמש שביקש
 * @returns {Promise<Buffer|null>}
 */
async function synthesizeTTS(text, profileName = 'shimon_calm', member = null) {
    if (!elevenLabs) {
        log('❌ [ElevenLabs Engine] ניסיון להשתמש במנוע TTS כאשר הלקוח אינו מאותחל.');
        return null;
    }
    
    const profile = VOICE_CONFIG[profileName] || DEFAULT_PROFILE;
    
    // בדיקה לוודא שה-ID של שירלי הוזן
    if (profile.id === 'ID_נשי_מעברית_להדביק_כאן') {
        log(`❌ [ElevenLabs Engine] ניסיון להשתמש בפרופיל "${profileName}" לפני שהוזן Voice ID עבור שירלי.`);
        return null;
    }
        
    const cleanText = text.replace(/[*_~`]/g, '');
    
    try {
        log(`[ElevenLabs Engine] מייצר אודיו עבור: "${cleanText}" עם פרופיל ${profileName}`);
        
        const audioStream = await elevenLabs.generate({
            text: cleanText,
            voice_id: profile.id, // שימוש ב-ID מהפרופיל
            model_id: 'eleven_multilingual_v3',
            output_format: 'mp3_44100_128',
            ...profile.settings // ✅ יישום הגדרות הסגנון (Stability וכו')
        });

        const audioBuffer = await streamToBuffer(audioStream);

        // רישום שימוש
        const userId = member ? member.id : 'system';
        const username = member ? member.displayName : 'System';
        await registerTTSUsage(cleanText.length, userId, username, 'ElevenLabs', profileName);

        return audioBuffer;

    } catch (error) {
        log(`❌ [ElevenLabs Engine] שגיאה בייצור קול: ${error.message}`);
        return null;
    }
}

/**
 * מייצר שיחה שלמה (פודקאסט) מסקריפט.
 * @param {Array<{speaker: string, text: string}>} script 
 * @param {import('discord.js').GuildMember} member
 * @returns {Promise<Buffer[]>}
 */
async function synthesizeConversation(script, member) {
    if (!elevenLabs) {
        // ✅ [תיקון]
        log(`❌ [ElevenLabs Engine] ניסיון להשתמש במנוע TTS (שיחה) כאשר הלקוח אינו מאותחל. (מפתח: ${process.env.ELEVEN_API_KEY ? 'קיים' : 'חסר'})`);
        return [];
    }
    
    // בדיקה לוודא שה-ID של שירלי הוזן
    if (SHIRLY_VOICE_ID === 'ID_נשי_מעברית_להדביק_כאן') {
        log('❌ [ElevenLabs Podcast] לא ניתן להתחיל פודקאסט. ה-Voice ID של שירלי חסר בקוד.');
        return []; // מחזיר מערך ריק
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

            const audioStream = await elevenLabs.generate({
                text: cleanText,
                voice_id: profile.id, // שימוש ב-ID מהפרופיל
                model_id: 'eleven_multilingual_v3',
                output_format: 'mp3_44100_128',
                ...profile.settings // ✅ יישום הגדרות הסגנון (Stability וכו')
            });
            
            const audioBuffer = await streamToBuffer(audioStream);
            audioBuffers.push(audioBuffer);

            await registerTTSUsage(cleanText.length, userId, username, 'ElevenLabs-Podcast', profileName);

        } catch (error) {
            log(`❌ [ElevenLabs Podcast] שגיאה בייצור שורה עבור: "${cleanText}"`, error.message);
        }
    }
    
    log(`[ElevenLabs Podcast] יצירת השיחה עבור ${username} הסתיימה. ${audioBuffers.length} קטעי אודיו נוצרו.`);
    return audioBuffers;
}

module.exports = {
    synthesizeConversation,
    synthesizeTTS,
};