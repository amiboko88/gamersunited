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

// --- ✅ [שדרוג תוכן] שינוי הוראות הטון ---
const VOICE_CONFIG = {
    // --- קולות לפודקאסט ---
    shimon: {
        model: 'gpt-4o-mini-tts',
        voice: 'ballad',
        instructions: 'Speak in a rude, angry, and slightly aggressive tone. Sound annoyed.' // ⬅️ שמעון כועס וגס
    },
    shirly: {
        model: 'gpt-4o-mini-tts',
        voice: 'coral',
        instructions: 'Speak in a pleasant, relaxed, flirty, and stoner-like tone. Sound very calm and seductive.' // ⬅️ שירלי סטלנית וחרמנית
    },
    
    // --- פרופילים סטטיים לפקודת /tts ---
    shimon_calm: {
        model: 'gpt-4o-mini-tts',
        voice: 'ballad',
        instructions: 'Speak in a very calm, slow, and relaxed tone.' 
    },
    shimon_energetic: {
        model: 'gpt-4o-mini-tts',
        voice: 'ballad',
        instructions: 'Speak in an energetic, excited, and fast-paced tone.' 
    },
};

const DEFAULT_PROFILE = VOICE_CONFIG.shimon;
// -----------------------------------------------------------------


/**
 * ממיר Stream ל-Buffer (גרסה מעודכנת עבור OpenAI)
 * @param {ReadableStream<Uint8Array>} stream 
 * @returns {Promise<Buffer>}
 */
async function streamToBuffer(stream) {
    const chunks = [];
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        return Buffer.concat(chunks);
    } catch (error) {
        log(`❌ [streamToBuffer] שגיאה באיסוף ה-Stream: ${error.message}`);
        throw error;
    } finally {
        reader.releaseLock();
    }
}

/**
 * מייצר אודיו בודד מטקסט.
 * @param {string} text - הטקסט להקראה
 * @param {string} profileName - שם הפרופיל (למשל 'shimon_calm')
 * @param {import('discord.js').GuildMember} member - המשתמש שביקש
 * @returns {Promise<Buffer|null>}
 */
async function synthesizeTTS(text, profileName = 'shimon_calm', member = null) {
    if (!openai) {
        log('❌ [OpenAI Engine] ניסיון להשתמש במנוע TTS כאשר הלקוח אינו מאותחל.');
        return null;
    }
    
    const profile = VOICE_CONFIG[profileName] || DEFAULT_PROFILE;
    const cleanText = text.replace(/[*_~`]/g, '');
    
    try {
        log(`[OpenAI Engine] מייצר אודיו עבור: "${cleanText}" עם פרופיל ${profileName} (קול: ${profile.voice})`);
        
        const response = await openai.audio.speech.create({
            model: profile.model,
            voice: profile.voice,
            input: cleanText,
            response_format: 'mp3',
            instructions: profile.instructions 
        });
        
        const audioBuffer = await streamToBuffer(response.body);

        const userId = member ? member.id : 'system';
        const username = member ? member.displayName : 'System';
        await registerTTSUsage(cleanText.length, userId, username, 'OpenAI', profileName);

        return audioBuffer;

    } catch (error) {
        log(`❌ [OpenAI Engine] שגיאה קריטית בייצור קול: ${error.message}`);
        log(error); 
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
    if (!openai) {
        log(`❌ [OpenAI Engine] ניסיון להשתמש במנוע TTS (שיחה) כאשר הלקוח אינו מאותחל.`);
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
            log(`[OpenAI Podcast] מייצר שורה: [${profileName}] - "${cleanText}"`);

            const response = await openai.audio.speech.create({
                model: profile.model,
                voice: profile.voice,
                input: cleanText,
                response_format: 'mp3',
                instructions: profile.instructions 
            });
            
            const audioBuffer = await streamToBuffer(response.body);
            audioBuffers.push(audioBuffer);

            await registerTTSUsage(cleanText.length, userId, username, 'OpenAI-Podcast', profileName);

        } catch (error) {
            log(`❌ [OpenAI Podcast] שגיאה בייצור שורה: ${error.message}`);
            log(error); 
        }
    }
    
    log(`[OpenAI Podcast] יצירת השיחה עבור ${username} הסתיימה. ${audioBuffers.length} קטעי אודיו נוצרו.`);
    return audioBuffers;
}

module.exports = {
    synthesizeConversation,
    synthesizeTTS,
};