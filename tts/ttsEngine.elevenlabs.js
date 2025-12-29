const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const { log } = require('../../utils/logger'); // וודא שהנתיב ללוגר נכון

// אתחול OpenAI
const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY 
});

// --- 🎭 מאגר קולות מגוון (HD) 🎭 ---
const VOICE_POOLS = {
    // קולות גבריים/רציניים לשמעון
    shimon: [
        'ash',    // הקול שאהבת (מחוספס)
        'onyx',   // עמוק וסמכותי
        'echo'    // יציב וברור
    ],
    // קולות נשיים/אנרגטיים לשירלי
    shirly: [
        'coral',  // נעים
        'nova',   // אנרגטי
        'shimmer',// רגוע
        'sage'    // ניטרלי
    ],
    // קריין (ניטרלי)
    narrator: [
        'alloy',
        'fable'
    ]
};

/**
 * בוחר קול רנדומלי מתוך המאגר של הדמות
 */
function getRandomVoice(character) {
    const pool = VOICE_POOLS[character] || VOICE_POOLS.narrator;
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * פונקציה לייצור אודיו בודד (להודעות רגילות או שורות פודקאסט)
 * מחזירה נתיב לקובץ (filePath)
 */
async function generateAudioFile(text, voice, fileName) {
    try {
        const mp3 = await openai.audio.speech.create({
            model: "tts-1-hd", // האיכות הכי גבוהה
            voice: voice,
            input: text,
            speed: 1.0
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        const dirPath = path.join(__dirname, '../../temp_podcast');
        const filePath = path.join(dirPath, fileName);

        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        fs.writeFileSync(filePath, buffer);
        return filePath;

    } catch (error) {
        console.error(`❌ OpenAI TTS Error:`, error.message);
        return null;
    }
}

/**
 * פונקציה ראשית 1: ייצור הודעה בודדת (synthesizeTTS)
 * תואם למבנה הישן
 */
async function synthesizeTTS(text, profileName = 'shimon') {
    if (!process.env.OPENAI_API_KEY) return null;

    let character = 'narrator';
    if (profileName.toLowerCase().includes('shimon')) character = 'shimon';
    if (profileName.toLowerCase().includes('shirly')) character = 'shirly';

    // בהודעה בודדת - מגרילים קול כל פעם
    const selectedVoice = getRandomVoice(character);
    const fileName = `tts_${Date.now()}.mp3`;

    log(`[TTS Single] 🎙️ Generating for ${profileName} using voice: ${selectedVoice}`);
    
    // שים לב: הפונקציה הישנה החזירה Buffer, החדשה מחזירה נתיב.
    // אם הבוט שלך מצפה ל-Buffer כאן, נצטרך לשנות את זה.
    // כרגע אני מחזיר נתיב כי זה מה שהפודקאסט צריך.
    return await generateAudioFile(text, selectedVoice, fileName);
}

/**
 * פונקציה ראשית 2: ייצור שיחה שלמה (synthesizeConversation)
 * תואם למבנה הישן - מקבל סקריפט ומחזיר רשימת קבצים
 */
async function synthesizeConversation(script, member) {
    if (!process.env.OPENAI_API_KEY) {
        log("❌ שגיאה: חסר OPENAI_API_KEY");
        return [];
    }

    const audioFiles = []; // רשימת נתיבים לקבצים

    // 🔥 שלב 1: בחירת קולות לכל הסשן (Session Voices)
    // אנחנו בוחרים קול אחד לשמעון וקול אחד לשירלי שילוו אותם לכל אורך השיחה הזו
    const sessionVoices = {
        shimon: getRandomVoice('shimon'),
        shirly: getRandomVoice('shirly'),
        narrator: getRandomVoice('narrator')
    };

    log(`[Podcast Init] 🎙️ קולות נבחרים לשיחה זו: שמעון (${sessionVoices.shimon}) | שירלי (${sessionVoices.shirly})`);

    // 🔥 שלב 2: לולאה על התסריט
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
        
        // יצירת האודיו
        const filePath = await generateAudioFile(line.text, selectedVoice, fileName);
        
        if (filePath) {
            audioFiles.push(filePath);
        } else {
            log(`❌ נכשל ביצירת שורה ${index} עבור ${line.speaker}`);
        }
    }

    log(`[Podcast Done] ✅ נוצרו ${audioFiles.length} קבצי אודיו.`);
    return audioFiles; // מחזיר מערך של נתיבים לקבצים
}

// ייצוא הפונקציות בשמות שהמערכת שלך מכירה
module.exports = {
    synthesizeTTS,
    synthesizeConversation,

};