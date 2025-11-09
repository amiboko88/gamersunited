// 📁 handlers/bf6Announcer.js
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');
const voiceQueue = require('./voiceQueue');

const BF6_MUSIC_DIR = path.join(__dirname, '..', 'music');

const bf6Sounds = [
    'theme1.mp3', 'theme2.mp3', 'theme3.mp3', 'theme4.mp3', 'theme5.mp3'
];

let filesChecked = false;

function checkFiles() {
    if (filesChecked) return;
    log('[BF6] בודק קיום קבצי אווירה של BF6...');
    let allFilesExist = true;
    
    bf6Sounds.forEach(file => {
        const filePath = path.join(BF6_MUSIC_DIR, file);
        if (!fs.existsSync(filePath)) {
            log(`⚠️ [BF6] קובץ חסר: ${file}.`);
            allFilesExist = false;
        }
    });

    if (allFilesExist) {
        log(`🎵 [BF6] כל ${bf6Sounds.length} קטעי האווירה של BF6 נטענו בהצלחה.`);
    }
    filesChecked = true;
}

async function playBf6Theme(channel, member) {
    checkFiles(); 
    
    const randomSound = bf6Sounds[Math.floor(Math.random() * bf6Sounds.length)];
    const filePath = path.join(BF6_MUSIC_DIR, randomSound);

    log(`[BF6] מנגן את ${randomSound} עבור ${member.displayName} בערוץ ${channel.name}`);

    try {
        // ✅ [שדרוג] מוסיף "type" ומשתמש בנתיב במקום Buffer
        voiceQueue.addToQueue(channel.guild.id, channel.id, filePath, member.client, 'BF6_THEME');
    } catch (error) {
        log(`❌ [BF6] שגיאה בניסיון לנגן את ${filePath}:`, error);
    }
}

module.exports = {
    playBf6Theme
};