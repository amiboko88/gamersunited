// 📁 handlers/voice/openaiTTS.js
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const admin = require('firebase-admin');
const db = require('../../utils/firebase');
const { getUserRef } = require('../../utils/userUtils');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const USAGE_COLLECTION = 'openAiTtsUsage'; 

// מאגר קולות (OpenAI HD Voices)
const VOICE_POOLS = {
    shimon: ['ash', 'onyx', 'echo'],      // גבריים רציניים
    shirly: ['coral', 'nova', 'shimmer'], // נשיים מגוונים
    narrator: ['alloy', 'fable']          // ניטרלי
};

class OpenAITTS {

    /**
     * מייצר שיחה שלמה לפודקאסט
     * @param {Array} script - מערך של שורות דיאלוג
     * @param {Object} member - המשתמש שיזם (לחיוב מכסות)
     */
    async synthesizeConversation(script, member) {
        const audioFiles = [];
        
        // בחירת קולות קבועים לסשן הנוכחי
        const sessionVoices = {
            shimon: this.getRandomVoice('shimon'),
            shirly: this.getRandomVoice('shirly'),
            narrator: this.getRandomVoice('narrator')
        };

        log(`[TTS] מתחיל יצור פודקאסט (${script.length} שורות)...`);

        for (const [index, line] of script.entries()) {
            const speakerKey = line.speaker.toLowerCase();
            let selectedVoice = sessionVoices.narrator;

            if (speakerKey.includes('shimon') || speakerKey.includes('שמעון')) {
                selectedVoice = sessionVoices.shimon;
            } else if (speakerKey.includes('shirly') || speakerKey.includes('שירלי')) {
                selectedVoice = sessionVoices.shirly;
            }

            const fileName = `line_${index}_${line.speaker}_${Date.now()}.mp3`;
            
            // יצירת הקובץ
            const filePath = await this.generateAudioFile(line.text, selectedVoice, fileName);

            if (filePath) {
                audioFiles.push(filePath);
                
                // חיוב המשתמש
                if (member && member.user) {
                    await this.registerUsage(
                        line.text.length, 
                        member.user.id, 
                        member.user.username, 
                        selectedVoice
                    );
                }
            }
        }

        return audioFiles; // מחזיר נתיבים לקבצים
    }

    /**
     * מייצר משפט בודד (לשימוש כללי)
     */
    async synthesizeSingle(text, character = 'shimon') {
        const voice = this.getRandomVoice(character);
        const fileName = `tts_${Date.now()}.mp3`;
        return await this.generateAudioFile(text, voice, fileName);
    }

    /**
     * הפונקציה הטכנית שפונה ל-OpenAI
     */
    async generateAudioFile(text, voice, fileName) {
        try {
            const mp3 = await openai.audio.speech.create({
                model: "tts-1-hd", // איכות גבוהה
                voice: voice,
                input: text,
            });

            const buffer = Buffer.from(await mp3.arrayBuffer());
            const tempDir = path.join(__dirname, '../../temp_audio');
            
            // וודא שתיקיית הזמניים קיימת
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            const filePath = path.join(tempDir, fileName);
            await fs.promises.writeFile(filePath, buffer);
            
            return filePath;
        } catch (error) {
            log(`❌ [TTS Engine] Error: ${error.message}`);
            return null;
        }
    }

    /**
     * רישום שימוש במכסות (DB)
     */
    async registerUsage(charCount, userId, username, voiceProfile) {
        if (charCount <= 0) return;

        try {
            const timestamp = new Date();
            
            // 1. לוג למעקב הוצאות
            db.collection(USAGE_COLLECTION).add({
                userId, username, characterCount: charCount,
                engine: 'openai-hd', voiceProfile, timestamp
            });

            // 2. עדכון פרופיל המשתמש
            const userRef = await getUserRef(userId, 'discord');
            userRef.set({
                stats: { aiCharsUsed: admin.firestore.FieldValue.increment(charCount) },
                meta: { lastActive: timestamp.toISOString() }
            }, { merge: true });

        } catch (e) {
            console.error(`[TTS Quota] Error: ${e.message}`);
        }
    }

    getRandomVoice(character) {
        const pool = VOICE_POOLS[character] || VOICE_POOLS.narrator;
        return pool[Math.floor(Math.random() * pool.length)];
    }
}

module.exports = new OpenAITTS();