const fs = require('fs');
const { log } = require('../utils/logger');

// --- סאונדבורד ---
const SOUND_TRIGGERS = {
    'בדיוק': './assets/sounds/kaha.mp3',
    'כסף': './assets/sounds/kesef.mp3',
    'צועק': './assets/sounds/zoek.mp3',
    'קדימה': './assets/sounds/kadima.mp3'

};

// --- סטיקרים ---
const STICKER_TRIGGERS = {

};

// --- גיפים / וידאו קצר ---
const GIF_TRIGGERS = {

    'נוב': 'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.mp4',
    'בוכה': 'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.mp4'
};

async function handleMedia(sock, senderJid, text) {
    const lowerText = text.toLowerCase();

    // 1. סאונד (MP3)
    for (const [trigger, filePath] of Object.entries(SOUND_TRIGGERS)) {
        if (lowerText.includes(trigger)) {
            if (fs.existsSync(filePath)) {
                log(`[WhatsApp] 🎵 Playing sound: ${trigger}`);
                await sock.sendMessage(senderJid, { 
                    audio: { url: filePath }, 
                    mimetype: 'audio/mpeg', // ✅ תיקון תקני
                    ptt: true 
                });
                return true; 
            }
        }
    }

    // 2. סטיקרים
    for (const [trigger, filePath] of Object.entries(STICKER_TRIGGERS)) {
        if (lowerText.includes(trigger)) {
            if (fs.existsSync(filePath)) {
                log(`[WhatsApp] 🖼️ Sending sticker: ${trigger}`);
                await sock.sendMessage(senderJid, { sticker: { url: filePath } });
                return true; 
            }
        }
    }

    // 3. גיפים (וידאו קצר)
    for (const [trigger, url] of Object.entries(GIF_TRIGGERS)) {
        if (lowerText.includes(trigger)) {
            log(`[WhatsApp] 🎬 Sending GIF: ${trigger}`);
            await sock.sendMessage(senderJid, { 
                video: { url: url },
                gifPlayback: true, // מתנגן אוטומטית בלופ
                caption: '🤖 שמעון מגיב...'
            });
            return true;
        }
    }

    return false; 
}

module.exports = { handleMedia };