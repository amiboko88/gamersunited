const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

// ✅ נתיב לתיקיית הנכסים הראשית (ללא תיקיות משנה)
const ASSETS_PATH = path.join(__dirname, '../assets');

// כאן כותבים רק את שם הקובץ!
const SOUND_TRIGGERS = {
    'בדיוק': 'kaha.mp3',
    'כסף': 'kesef.mp3',
    'צועק': 'zoek.mp3',
    'קדימה': 'kadima.mp3',
    'חחח': 'laugh.mp3'
};

const STICKER_TRIGGERS = {
    'שמעון': 'shimon_logo.webp',
    'בוט': 'robot.webp',
    'יוגי': 'yogi.webp'
};

const GIF_TRIGGERS = {
    'סמרטוט': 'https://media.giphy.com/media/l0HlCqV35hdEg2LS0/giphy.mp4',
    'נוב': 'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.mp4',
    'ניצחון': 'https://media.giphy.com/media/nVVVMDfwsvqeg/giphy.mp4',
    'בוכה': 'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.mp4'
};

async function handleMedia(sock, senderJid, text) {
    if (!text) return false;
    
    // ניקוי טקסט וספירת מילים
    const cleanText = text.toLowerCase().replace(/[.,?!;]/g, '').trim();
    const wordCount = cleanText.split(/\s+/).length;

    console.log(`[Media Debug] Text: "${cleanText}" | Words: ${wordCount}`);

    // 1. סאונד (MP3)
    for (const [trigger, fileName] of Object.entries(SOUND_TRIGGERS)) {
        if (cleanText.includes(trigger)) {
            const fullPath = path.join(ASSETS_PATH, fileName);
            
            // בדיקת קיום קובץ
            if (!fs.existsSync(fullPath)) {
                console.error(`[Media Error] ❌ קובץ לא נמצא ב-assets: ${fileName}`);
                continue; 
            }

            // לוגיקה חכמה: פאנץ' (סוף משפט) או משפט קצר
            const isPunchline = cleanText.endsWith(trigger);
            const isShortContext = wordCount <= 7; 
            
            if (isPunchline || isShortContext) {
                log(`[WhatsApp] 🎵 Smart Trigger found: "${trigger}"`);
                await sock.sendMessage(senderJid, { 
                    audio: { url: fullPath }, 
                    mimetype: 'audio/mpeg', 
                    ptt: true 
                });
                return true; // עוצר את ה-AI
            }
        }
    }

    // 2. סטיקרים
    for (const [trigger, fileName] of Object.entries(STICKER_TRIGGERS)) {
        if (cleanText.includes(trigger)) {
            const fullPath = path.join(ASSETS_PATH, fileName);
            
            if (!fs.existsSync(fullPath)) {
                console.error(`[Media Error] ❌ סטיקר לא נמצא ב-assets: ${fileName}`);
                continue;
            }

            // סטיקר רק אם זה קצר וקולע (עד 3 מילים)
            if (wordCount <= 3) {
                log(`[WhatsApp] 🖼️ Sending sticker: ${trigger}`);
                await sock.sendMessage(senderJid, { sticker: { url: fullPath } });
                return true;
            }
        }
    }

    // 3. גיפים
    for (const [trigger, url] of Object.entries(GIF_TRIGGERS)) {
        if (cleanText.includes(trigger) && wordCount <= 5) {
            log(`[WhatsApp] 🎬 Sending GIF: ${trigger}`);
            await sock.sendMessage(senderJid, { 
                video: { url: url },
                gifPlayback: true
            });
            return true;
        }
    }

    return false; 
}

module.exports = { handleMedia };