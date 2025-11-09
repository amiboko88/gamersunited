// 📁 handlers/bf6Announcer.js
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');
const voiceQueue = require('./voiceQueue');

// ✅ [תיקון] הנתיב מצביע עכשיו לתת-התיקייה החדשה
const BF6_MUSIC_DIR = path.join(__dirname, '..', 'music', 'bf6');

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
    
    // ✅ [תיקון] מוודא שהתיקייה קיימת לפני שקורא ממנה
    if (!fs.existsSync(BF6_MUSIC_DIR)) {
        log(`❌ [BF6] התיקייה "music/bf6" לא קיימת. הפיצ'ר לא יפעל.`);
        fs.mkdirSync(BF6_MUSIC_DIR, { recursive: true });
        log('[BF6] נוצרה תיקיית "music/bf6" ריקה. אנא הוסף קבצי MP3.');
        allFilesExist = false;
    } else {
        bf6Sounds.forEach(file => {
            const filePath = path.join(BF6_MUSIC_DIR, file);
            if (!fs.existsSync(filePath)) {
                log(`⚠️ [BF6] קובץ חסר: ${file} (בתוך music/bf6).`);
                allFilesExist = false;
            }
        });
    }

    if (allFilesExist) {
        log(`🎵 [BF6] כל ${bf6Sounds.length} קטעי האווירה של BF6 נטענו בהצלחה מ-'music/bf6'.`);
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
    
    const randomSound = bf6Sounds[Math.floor(Math.random() * bf6Sounds.length)];
    const filePath = path.join(BF6_MUSIC_DIR, randomSound);

    log(`[BF6] מנגן את ${randomSound} עבור ${member.displayName} בערוץ ${channel.name}`);

    try {
        // שולח נתיב מלא ל-voiceQueue
        voiceQueue.addToQueue(channel.guild.id, channel.id, filePath, member.client, 'BF6_THEME');
    } catch (error) {
        log(`❌ [BF6] שגיאה בניסיון לנגן את ${filePath}:`, error);
    }
}

module.exports = {
    playBf6Theme
};