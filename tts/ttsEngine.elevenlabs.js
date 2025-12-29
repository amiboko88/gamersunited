const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
// ✅ תיקון נתיב: יציאה אחת אחורה בלבד מתיקיית tts
const { log } = require('../utils/logger'); 

const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY 
});

// --- 🎭 מאגר קולות מגוון (HD) 🎭 ---
const VOICE_POOLS = {
    shimon: ['ash', 'onyx', 'echo'],      // גבריים רציניים
    shirly: ['coral', 'nova', 'shimmer'], // נשיים מגוונים
    narrator: ['alloy', 'fable']          // ניטרלי
};

function getRandomVoice(character) {
    const pool = VOICE_POOLS[character] || VOICE_POOLS.narrator;
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * פונקציית עזר לייצור קובץ אודיו
 */
async function generateAudioFile(text, voice, fileName) {
    try {
        const mp3 = await openai.audio.speech.create({
            model: "tts-1-hd",
            voice: voice,
            input: text,
            speed: 1.0
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        // ✅ תיקון נתיב: יציאה אחת אחורה ל-root ואז ל-temp_podcast
        const dirPath = path.join(__dirname, '../temp_podcast');
        const filePath = path.join(dirPath, fileName);

        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        fs.writeFileSync(filePath, buffer);
        return filePath;

    } catch (error) {
        log(`❌ OpenAI TTS Error: ${error.message}`);
        return null;
    }
}

/**
 * פונקציה 1: הודעה בודדת (synthesizeTTS)
 */
async function synthesizeTTS(text, profileName = 'shimon') {
    if (!process.env.OPENAI_API_KEY) return null;

    let character = 'narrator';
    if (profileName.toLowerCase().includes('shimon')) character = 'shimon';
    if (profileName.toLowerCase().includes('shirly')) character = 'shirly';

    const selectedVoice = getRandomVoice(character);
    const fileName = `tts_${Date.now()}.mp3`;

    log(`[TTS Single] 🎙️ מייצר עבור ${profileName} (קול: ${selectedVoice})`);
    
    // החזרת נתיב לקובץ (במקום באפר, לטובת אחידות עם הפודקאסט)
    return await generateAudioFile(text, selectedVoice, fileName);
}

/**
 * פונקציה 2: פודקאסט מלא (synthesizeConversation)
 */
async function synthesizeConversation(script, member) {
    if (!process.env.OPENAI_API_KEY) {
        log("❌ שגיאה: חסר OPENAI_API_KEY");
        return [];
    }

    const audioFiles = [];

    // בחירת קולות קבועים לכל השיחה הזו (כדי לשמור על רצף)
    const sessionVoices = {
        shimon: getRandomVoice('shimon'),
        shirly: getRandomVoice('shirly'),
        narrator: getRandomVoice('narrator')
    };

    log(`[Podcast Init] 🎙️ קולות לשיחה: שמעון (${sessionVoices.shimon}) | שירלי (${sessionVoices.shirly})`);

    let index = 0;
    for (const line of script) {
        if (!line.speaker || !line.text) continue;

        index++;
        const speakerKey = line.speaker.toLowerCase();
        let selectedVoice = sessionVoices.narrator;

        if (speakerKey.includes('shimon') || speakerKey.includes('שמעון')) {
            selectedVoice = sessionVoices.shimon;
        } else if (speakerKey.includes('shirly') || speakerKey.includes('שירלי')) {
            selectedVoice = sessionVoices.shirly;
        }

        const fileName = `line_${index}_${line.speaker}_${Date.now()}.mp3`;
        const filePath = await generateAudioFile(line.text, selectedVoice, fileName);
        
        if (filePath) {
            audioFiles.push(filePath);
        }
    }

    return audioFiles; // מחזיר מערך של נתיבים
}

// ייצוא הפונקציות (כולל תמיכה לאחור בשמות)
module.exports = {
    synthesizeTTS,
    synthesizeConversation,
    generateTTS: synthesizeTTS 
};