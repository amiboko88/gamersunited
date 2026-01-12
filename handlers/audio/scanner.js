// 📁 handlers/audio/scanner.js
const fs = require('fs');
const path = require('path');

const BASE_PATH = path.join(__dirname, '../../assets/audio');

const PATHS = {
    tracks: path.join(BASE_PATH, 'tracks'),
    effects: path.join(BASE_PATH, 'effects')
};

class AudioScanner {
    constructor() {
        // וידוא שהתיקיות קיימות
        if (!fs.existsSync(PATHS.tracks)) fs.mkdirSync(PATHS.tracks, { recursive: true });
        if (!fs.existsSync(PATHS.effects)) fs.mkdirSync(PATHS.effects, { recursive: true });
    }

    /**
     * מקבל רשימת שירים (קבצים ארוכים)
     */
    getTracks() {
        return this.scanFolder(PATHS.tracks);
    }

    /**
     * מקבל רשימת אפקטים (קבצים קצרים)
     */
    getEffects() {
        return this.scanFolder(PATHS.effects);
    }

    scanFolder(folderPath) {
        try {
            const files = fs.readdirSync(folderPath);
            return files
                .filter(file => file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.ogg'))
                .map(file => ({
                    name: file.replace(/\.[^/.]+$/, ""), // שם נקי לתצוגה
                    filename: file, // שם הקובץ המקורי
                    fullPath: path.join(folderPath, file) // ✅ נתיב מלא לשליחה
                }));
        } catch (error) {
            console.error(`Error scanning audio folder: ${error.message}`);
            return [];
        }
    }
}

module.exports = new AudioScanner();