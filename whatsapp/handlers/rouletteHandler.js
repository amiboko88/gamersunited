const path = require('path');
const fs = require('fs');

const SHIMON_ASSETS = {
    sticker: path.join(__dirname, '../../assets/logowa.webp'), // שים לב לנתיב ה-Relative
    gifs: [
        'https://media.giphy.com/media/l0HlCqV35hdEg2LS0/giphy.mp4', 
        'https://media.giphy.com/media/3o7TKr3nzbh5WgCFxe/giphy.mp4',
        'https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.mp4'
    ]
};

async function handleShimonRoulette(sock, chatJid) {
    const rand = Math.random(); 
    if (rand < 0.3 && fs.existsSync(SHIMON_ASSETS.sticker)) {
        await sock.sendMessage(chatJid, { sticker: { url: SHIMON_ASSETS.sticker } });
        return true;
    } else if (rand < 0.6) {
        const randomGif = SHIMON_ASSETS.gifs[Math.floor(Math.random() * SHIMON_ASSETS.gifs.length)];
        await sock.sendMessage(chatJid, { video: { url: randomGif }, gifPlayback: true });
        return true;
    }
    return false; 
}

module.exports = { handleShimonRoulette };