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
                    name: file.replace(/\.[^/.]+$/, ""), // הסרת סיומת לתצוגה יפה
                    filename: file,
                    path: path.join(folderPath, file)
                }));
        } catch (error) {
            console.error(`[AudioScanner] Error scanning ${folderPath}:`, error);
            return [];
        }
    }
}

module.exports = new AudioScanner();