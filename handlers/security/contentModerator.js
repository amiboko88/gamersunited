// 📁 handlers/security/contentModerator.js
const { OpenAI } = require('openai');
const admin = require('firebase-admin');
const { getUserRef } = require('../../utils/userUtils');
const { sendStaffLog } = require('../../utils/staffLogger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class ContentModerator {

    /**
     * בודק תוכן באמצעות AI
     * @returns {Promise<{isSafe: boolean, category: string}>}
     */
    async checkContent(text) {
        if (!text || text.length < 2) return { isSafe: true };

        try {
            const response = await openai.moderations.create({ input: text });
            const result = response.results[0];

            if (result.flagged) {
                const categories = Object.keys(result.categories)
                    .filter(cat => result.categories[cat])
                    .join(', ');
                return { isSafe: false, category: categories };
            }
            return { isSafe: true };

        } catch (error) {
            console.error('[Moderator] API Error:', error.message);
            return { isSafe: true }; // Fail open (לא חוסמים אם ה-AI נפל)
        }
    }

    /**
     * מטפל בהפרה (מתעד, מזהיר, ומדווח)
     */
    async handleViolation(userId, displayName, platform, content, category, guildName = 'Unknown') {
        console.log(`🚨 [Moderator] Violation detected via ${platform}: ${category}`);

        // 1. תיעוד ב-DB ("הספר השחור")
        try {
            const userRef = await getUserRef(userId, platform);
            await userRef.update({
                'history.infractions': admin.firestore.FieldValue.arrayUnion({
                    type: category,
                    content: content,
                    date: new Date().toISOString(),
                    severity: 'high',
                    detectedBy: 'AI_Moderation',
                    platform: platform
                }),
                'stats.warningCount': admin.firestore.FieldValue.increment(1)
            });
        } catch (e) { console.error('[Moderator] DB Log Error:', e); }

        // 2. לוג לצוות (רק בדיסקורד יש ערוץ לוגים ויזואלי כרגע)
        await sendStaffLog(
            `🚨 ${platform.toUpperCase()} Violation (AI)`,
            `סוג: **${category}**`,
            'Red',
            [
                { name: 'משתמש', value: `${displayName} (${userId})` },
                { name: 'תוכן', value: `||${content}||` }
            ]
        );

        // מחזיר הודעת אזהרה למשתמש (שהקוד הקורא ישלח)
        return `🛑 **הודעתך נחסמה.**\nמערכת ה-AI זיהתה תוכן מסוג: \`${category}\`.\nנא לשמור על שפה נקייה.`;
    }
}

module.exports = new ContentModerator();