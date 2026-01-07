// 📁 handlers/media/director.js
const path = require('path');
const fs = require('fs');
const { getUserData } = require('../../utils/userUtils');
const voiceSystem = require('./voice'); // ElevenLabs
const generatorSystem = require('./generator'); // Replicate

// נתיבים לנכסים קבועים (גיבוי)
const ASSETS_PATH = path.join(__dirname, '../../assets');

/**
 * המוח שמאחורי המדיה. מחליט איך להגיב ויזואלית/קולית.
 */
async function handleSmartResponse(text, userId, platform, userName) {
    const cleanText = text.trim().toLowerCase();
    
    // --- 1. טריגר כסף חכם (Smart TTS) ---
    if (cleanText.includes('כסף') || cleanText.includes('ארנק') || cleanText.includes('יתרה')) {
        // שליפת נתונים אמיתיים
        const userData = await getUserData(userId, platform);
        const balance = userData?.economy?.balance || 0;
        
        let ttsText = "";
        if (balance <= 0) ttsText = `יא חי בסרט, אין לך שקל על התחת.`;
        else if (balance < 500) ttsText = `יש לך ${balance} שקל. לא מספיק לשווארמה.`;
        else if (balance > 5000) ttsText = `בואנה ${userName}, אתה טחון. זרוק איזה אלפייה.`;
        else ttsText = `מצב העובר ושב שלך הוא ${balance}. סביר.`;

        // יצירת קול בזמן אמת
        const audioBuffer = await voiceSystem.textToSpeech(ttsText);
        if (audioBuffer) return { type: 'audio_buffer', data: audioBuffer };
    }

    // --- 2. טריגר דמויות (Replicate Sticker) ---
    // אם מזכירים שם של חבר, נייצר סטיקר שלו בסיטואציה
    const nameMapping = { 'קלי': 'kalimero', 'יוגי': 'yogi', 'עמר': 'amar' }; // דוגמה
    for (const [hebName, engName] of Object.entries(nameMapping)) {
        if (cleanText.includes(hebName)) {
            // כאן נשתמש ב-Generator שכבר בנינו
            // נניח שיש לנו תמונת בסיס שמורה ב-assets/faces
            const facePath = path.join(ASSETS_PATH, 'faces', `${engName}.jpg`);
            if (fs.existsSync(facePath)) {
                const faceBuffer = fs.readFileSync(facePath);
                const base64Face = `data:image/jpeg;base64,${faceBuffer.toString('base64')}`;
                
                // יצירת סטיקר AI: הדמות עושה משהו מצחיק
                const stickerUrl = await generatorSystem.generateMeme(base64Face, "A funny 3d sticker of a cute character looking surprised, high quality");
                if (stickerUrl) return { type: 'sticker_url', url: stickerUrl };
            }
        }
    }

    // --- 3. גיפים קלאסיים (Fallback) ---
    // לפעמים הקלאסיקות זה מה שצריך
    if (cleanText.includes('נוב') || cleanText.includes('בוכה')) {
        return { type: 'video', url: 'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.mp4' };
    }

    return null;
}

module.exports = { handleSmartResponse };