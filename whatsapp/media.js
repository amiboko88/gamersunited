const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

const ASSETS_PATH = path.join(__dirname, '../assets');

// סטיקרים נשארים כרגיל
const STICKER_TRIGGERS = {
    'קלי': 'kalimero.webp',
    'יוגי': 'yogi.webp',
    'עמר': 'amar.webp'
};

const SOUND_TRIGGERS = {
    'בדיוק': 'kaha.mp3',
    'כסף': 'kesef.mp3',
    'צועק': 'zoek.mp3',
    'קדימה': 'kadima.mp3'
};

const GIF_TRIGGERS = {
    'נוב': 'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.mp4',
    'בוכה': 'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.mp4'
};

// 🛑 מילים שאם הן מופיעות ביחד עם "כסף", לא ננגן את הסאונד (כי זו כנראה שאלה לבוט)
const MONEY_CONTEXT_BLOCKLIST = ['כמה', 'יש לי', 'ארנק', 'חשבון', 'יתרה', 'מצב', 'balance', 'xp', 'שלי'];

async function handleMedia(sock, senderJid, text) {
    if (!text) return false;
    
    const cleanText = text.toLowerCase().replace(/[.,?!;]/g, '').trim();
    const wordCount = cleanText.split(/\s+/).length;

    // 1. סאונד (Soundboard)
    for (const [trigger, fileName] of Object.entries(SOUND_TRIGGERS)) {
        if (cleanText.includes(trigger)) {
            
            // 🔥 תיקון חכם למילה "כסף" 🔥
            if (trigger === 'כסף') {
                // בדיקה 1: האם זו שאלה טכנית? (כמה כסף יש לי?)
                // אם המשפט מכיל מילה מהרשימה השחורה -> מדלגים על הסאונד ומעבירים ל-AI
                if (MONEY_CONTEXT_BLOCKLIST.some(blockWord => cleanText.includes(blockWord))) {
                    continue; 
                }

                // בדיקה 2: אורך המשפט
                // אם זה משפט ארוך מידי (מעל 3 מילים) והוא לא שאלה טכנית, כנראה שזה סתם דיבור רגיל ולא צריך סאונד אפקט.
                // ננגן רק אם זה: "כסף", "רוצה כסף", "איפה הכסף"
                if (wordCount > 3) continue;
            }

            const fullPath = path.join(ASSETS_PATH, fileName);
            if (!fs.existsSync(fullPath)) continue;

            // תנאים כלליים לשאר הסאונדים
            const isPunchline = cleanText.endsWith(trigger);
            // הקשחתי את התנאי: סאונד ינוגן רק במשפטים קצרים (עד 4 מילים) או כפאנץ' בסוף משפט
            const isShortContext = wordCount <= 4; 
            
            if (isPunchline || isShortContext) {
                log(`[WhatsApp] 🎵 Smart Trigger: "${trigger}"`);
                // שיניתי ל-mimetype שתומך גם באנדרואיד
                await sock.sendMessage(senderJid, { 
                    audio: { url: fullPath }, 
                    mimetype: 'audio/ogg; codecs=opus', 
                    ptt: true 
                });
                return true; // עצרנו כאן, ה-AI לא יגיב
            }
        }
    }

    // 2. סטיקרים
    for (const [trigger, fileName] of Object.entries(STICKER_TRIGGERS)) {
        if (cleanText.includes(trigger)) {
            const fullPath = path.join(ASSETS_PATH, fileName);
            if (!fs.existsSync(fullPath)) continue;

            if (wordCount <= 3) {
                log(`[WhatsApp] 🖼️ Sticker Trigger: "${trigger}"`);
                await sock.sendMessage(senderJid, { sticker: { url: fullPath } });
                return true;
            }
        }
    }

    // 3. גיפים
    for (const [trigger, url] of Object.entries(GIF_TRIGGERS)) {
        if (cleanText.includes(trigger) && wordCount <= 5) {
            log(`[WhatsApp] 🎬 GIF Trigger: "${trigger}"`);
            await sock.sendMessage(senderJid, { video: { url: url }, gifPlayback: true });
            return true;
        }
    }

    return false; // לא נמצא מדיה, מעביר לטיפול ה-Logic
}

module.exports = { handleMedia };