const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

const ASSETS_PATH = path.join(__dirname, '../assets');

// ⚠️ שים לב: אין פה את 'שמעון'. זה מטופל ב-logic עכשיו.
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

async function handleMedia(sock, senderJid, text) {
    if (!text) return false;
    
    const cleanText = text.toLowerCase().replace(/[.,?!;]/g, '').trim();
    const wordCount = cleanText.split(/\s+/).length;

    // 1. סאונד
    for (const [trigger, fileName] of Object.entries(SOUND_TRIGGERS)) {
        if (cleanText.includes(trigger)) {
            const fullPath = path.join(ASSETS_PATH, fileName);
            if (!fs.existsSync(fullPath)) continue;

            const isPunchline = cleanText.endsWith(trigger);
            const isShortContext = wordCount <= 7; 
            
            if (isPunchline || isShortContext) {
                log(`[WhatsApp] 🎵 Smart Trigger: "${trigger}"`);
                await sock.sendMessage(senderJid, { audio: { url: fullPath }, mimetype: 'audio/mpeg', ptt: true });
                return true; 
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

    return false; 
}

module.exports = { handleMedia };