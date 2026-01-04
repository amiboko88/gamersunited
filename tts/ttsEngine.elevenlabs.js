// 📁 tts/ttsEngine.elevenlabs.js
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const { log } = require('../utils/logger'); 
const { registerTTSUsage } = require('./ttsQuotaManager.eleven.js');

const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY 
});

// --- 🎭 מאגר קולות מגוון (HD) 🎭 ---
// הגדרתי קבועים כדי שיהיה קל לשנות בעתיד
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
 * פונקציית עזר לייצור קובץ אודיו פיזי
 * (נחוץ כי מערכת ה-Queue שלך עובדת עם נתיבי קבצים)
 */
async function generateAudioFile(text, voice, fileName) {
    try {
        // בקשה ל-OpenAI
        const mp3 = await openai.audio.speech.create({
            model: "tts-1-hd", // איכות גבוהה
            voice: voice,
            input: text,
            speed: 1.0
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        // יצירת התיקייה אם לא קיימת
        const outputDir = path.join(__dirname, '../temp_tts');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const filePath = path.join(outputDir, fileName);
        fs.writeFileSync(filePath, buffer);
        
        return filePath;

    } catch (error) {
        log(`❌ שגיאה ביצירת קובץ אודיו (${fileName}): ${error.message}`);
        return null;
    }
}

/**
 * מפיק שיחה שלמה (פודקאסט)
 * מקבל מערך של שורות: [{ speaker: 'shimon', text: '...' }, ...]
 */
async function synthesizeConversation(script, member) {
    if (!process.env.OPENAI_API_KEY) {
        log("❌ שגיאה: חסר OPENAI_API_KEY בקובץ הסביבה.");
        return [];
    }

    const audioFiles = [];

    // בחירת קולות קבועים לכל השיחה הזו (כדי לשמור על רצף ועקביות בשיחה אחת)
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

        // זיהוי הדובר
        if (speakerKey.includes('shimon') || speakerKey.includes('שמעון')) {
            selectedVoice = sessionVoices.shimon;
        } else if (speakerKey.includes('shirly') || speakerKey.includes('שירלי')) {
            selectedVoice = sessionVoices.shirly;
        }

        const fileName = `line_${index}_${line.speaker}_${Date.now()}.mp3`;
        const filePath = await generateAudioFile(line.text, selectedVoice, fileName);

        if (filePath) {
            audioFiles.push(filePath);
            
            // ✅ דיווח צריכה למערכת המכסות החדשה
            // מזהה את המשתמש שיזם את הפודקאסט (member)
            if (member && member.user) {
                await registerTTSUsage(
                    line.text.length, 
                    member.user.id, 
                    member.user.username, 
                    'openai-hd', 
                    selectedVoice
                );
            }
        }
    }

    return audioFiles; // מחזיר מערך של נתיבים לקבצים שנוצרו
}

// פונקציה גנרית ליצירת משפט בודד (לשימוש ברוסטים בודדים וכו')
async function synthesizeTTS(text, voiceProfile = 'shimon') {
    const voice = getRandomVoice(voiceProfile);
    const mp3 = await openai.audio.speech.create({
        model: "tts-1-hd",
        voice: voice,
        input: text,
    });
    return Buffer.from(await mp3.arrayBuffer());
}

module.exports = { synthesizeConversation, synthesizeTTS };