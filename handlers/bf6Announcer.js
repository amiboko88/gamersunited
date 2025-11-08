// 📁 handlers/bf6Announcer.js
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');
const voiceQueue = require('./voiceQueue');

const BF6_MUSIC_DIR = path.join(__dirname, '..', 'music');

const bf6Sounds = [
    'theme1.mp3',
    'theme2.mp3',
    'theme3.mp3',
    'theme4.mp3',
    'theme5.mp3' 
];

let filesChecked = false;

// פונקציה לבדיקת קיום הקבצים (רצה פעם אחת)
function checkFiles() {
    if (filesChecked) return;
    log('[BF6] בודק קיום קבצי אווירה של BF6...');
    let allFilesExist = true;
    
    bf6Sounds.forEach(file => { // ⬅️ שונה ללולאה על המערך החדש
        const filePath = path.join(BF6_MUSIC_DIR, file);
        if (!fs.existsSync(filePath)) {
            log(`⚠️ [BF6] קובץ חסר: ${file}. הפיצ'ר עלול לא לעבוד כראוי.`);
            allFilesExist = false;
        }
    });

    if (allFilesExist) {
        log(`🎵 [BF6] כל ${bf6Sounds.length} קטעי האווירה של BF6 נטענו בהצלחה.`); // ⬅️ שונה להצגת הספירה הנכונה
    }
    filesChecked = true;
}

/**
 * מנגן קטע אווירה רנדומלי של BF6 בערוץ קולי.
 * @param {import('discord.js').VoiceChannel} channel
 * @param {import('discord.js').GuildMember} member
 */
async function playBf6Theme(channel, member) {
    checkFiles(); // מוודא שהקבצים קיימים (רק בפעם הראשונה)
    
    // בחר קטע רנדומלי מהמאגר
    const randomSound = bf6Sounds[Math.floor(Math.random() * bf6Sounds.length)]; // ⬅️ בחירה רנדומלית פשוטה
    const filePath = path.join(BF6_MUSIC_DIR, randomSound);

    log(`[BF6] מנגן את ${randomSound} עבור ${member.displayName} בערוץ ${channel.name}`);

    try {
        const audioBuffer = fs.readFileSync(filePath);
        voiceQueue.addToQueue(channel.guild.id, channel.id, audioBuffer, member.client);
    } catch (error) {
        log(`❌ [BF6] שגיאה בניסיון לנגן את ${filePath}:`, error);
    }
}

module.exports = {
    playBf6Theme
};