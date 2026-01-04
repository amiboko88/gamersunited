// 📁 telegram/telegramTTSRoaster.js
const { log } = require('../utils/logger');
const ttsEngine = require('../tts/ttsEngine.elevenlabs'); 
const { InputFile } = require('grammy'); 

const VOICE_PROFILE = 'shimon_energetic'; 

/**
 * יוצר קובץ קול מטקסט ושולח אותו לטלגרם.
 */
async function generateRoastVoice(ctx, roastText, targetUsername) {
    try {
        log(`[TELEGRAM-TTS] מתחיל יצירת קול עבור Roast על ${targetUsername}`);

        // 1. יצירת האודיו (Buffer)
        const audioBuffer = await ttsEngine.synthesizeTTS(roastText, VOICE_PROFILE);
        
        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('TTS engine returned an empty audio buffer.');
        }

        // 2. המרה ל-InputFile של grammy
        const voiceFile = new InputFile(audioBuffer, 'roast.ogg');

        // 3. שליחה
        await ctx.replyWithVoice(voiceFile, {
            caption: `🎤 <b>${targetUsername}</b>, שמעון אומר:\n"${roastText}"`,
            parse_mode: 'HTML'
        });

        log(`[TELEGRAM-TTS] ✅ קובץ קול נשלח בהצלחה.`);

    } catch (error) {
        log(`❌ [TELEGRAM-TTS] Error: ${error.message}`);
        throw error; // זורק כדי שהפונקציה הקוראת תדע שהייתה שגיאה
    }
}

module.exports = { generateRoastVoice };