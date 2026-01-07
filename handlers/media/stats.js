// 📁 handlers/media/stats.js
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');

class MediaStats {
    
    /**
     * שולף את כל נתוני השימוש ב-TTS (לצורך דוחות)
     */
    async getTTSUsageReport() {
        try {
            // הנחה: הנתונים נשמרים בקולקשן 'tts_logs' או דומה
            const snapshot = await db.collection('tts_logs').get();
            
            if (snapshot.empty) return null;

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            let stats = {
                totalCharsAllTime: 0,
                totalCharsMonth: 0,
                totalCharsToday: 0,
                userUsage: {},
                profileUsage: {}
            };

            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data.timestamp) return; // הגנה

                // טיפול בתאריכים של פיירבייס
                const timestamp = data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                const charCount = data.characterCount || data.text?.length || 0;
                const username = data.username || "Unknown";
                const profile = data.voiceProfile || "Default";

                // חישובים
                stats.totalCharsAllTime += charCount;
                if (timestamp >= startOfMonth) stats.totalCharsMonth += charCount;
                if (timestamp >= startOfDay) stats.totalCharsToday += charCount;

                // אגרגציה למשתמשים
                stats.userUsage[username] = (stats.userUsage[username] || 0) + charCount;
                
                // אגרגציה לפרופילים
                stats.profileUsage[profile] = (stats.profileUsage[profile] || 0) + 1;
            });

            return stats;

        } catch (error) {
            log(`❌ [MediaStats] Error generating report: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new MediaStats();