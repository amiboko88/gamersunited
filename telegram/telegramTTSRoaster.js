// 📁 telegram/telegramTTSRoaster.js (מתוקן ומקצועי)
const { log } = require('../utils/logger');
const ttsEngine = require('../tts/ttsEngine.elevenlabs'); // זהו מנוע גוגל, למרות השם
const { InputFile } = require('grammy'); // --- ✅ [שדרוג] ייבוא הרכיב החיוני ---

const VOICE_PROFILE = 'shimon_energetic';

/**
 * יוצר קובץ קול מטקסט ה"צליה" ושולח אותו לטלגרם.
 * @param {import('grammy').Context} ctx - קונטקסט השיחה של grammY.
 * @param {string} roastText - הטקסט שנוצר על ידי GPT.
 * @param {string} targetUsername - שם המשתמש של קורבן הצלייה.
 */
async function generateRoastVoice(ctx, roastText, targetUsername) {
    try {
        log(`[TELEGRAM-TTS] מתחיל יצירת קול עבור Roast על ${targetUsername}`);

        // 1. יצירת האודיו באמצעות מנוע ה-TTS המרכזי של הבוט
        const audioBuffer = await ttsEngine.synthesizeTTS(roastText, VOICE_PROFILE);
        
        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('TTS engine returned an empty audio buffer.');
        }

        // --- ✅ [תיקון קריטי] עטיפת קובץ השמע באובייקט InputFile ---
        // זו הדרך המודרנית והנכונה לשלוח קבצים מהזיכרון ב-grammY.
        const voiceFile = new InputFile(audioBuffer, 'roast.ogg');
        // ----------------------------------------------------------------

        // 2. שליחת קובץ הקול למשתמש בטלגרם
        await ctx.replyWithVoice(voiceFile, {
            caption: `🎤 ${targetUsername}, ${roastText}`,
            parse_mode: 'HTML' // מאפשר עיצוב טקסט במידת הצורך
        });

        log(`[TELEGRAM-TTS] ✅ קובץ קול נשלח בהצלחה ל-${ctx.from.username}`);

    } catch (error) {
        log('❌ [TELEGRAM-TTS] generateRoastVoice error:', error);
        // שלח הודעת שגיאה חזרה למשתמש כדי שהוא ידע שהייתה בעיה
        await ctx.reply('אוי... משהו השתבש במיתרי הקול שלי. נסה שוב מאוחר יותר. 🥴');
    }
}

module.exports = {
    generateRoastVoice,
};