// 📁 handlers/economy/roulette.js
const path = require('path');
const fs = require('fs');

const ASSETS = {
    sticker: path.join(__dirname, '../../assets/logowa.webp'),
    gifs: [
        'https://media.giphy.com/media/l0HlCqV35hdEg2LS0/giphy.mp4', 
        'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.mp4'
    ]
};

async function spinRoulette() {
    const rand = Math.random();
    
    // 30% סיכוי לסטיקר
    if (rand < 0.3 && fs.existsSync(ASSETS.sticker)) {
        return { type: 'sticker', path: ASSETS.sticker };
    } 
    // 30% סיכוי לגיף
    else if (rand < 0.6) {
        const randomGif = ASSETS.gifs[Math.floor(Math.random() * ASSETS.gifs.length)];
        return { type: 'video', url: randomGif };
    }
    
    return null; // 40% כלום (מתח)
}

module.exports = { spinRoulette };