const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const stringSimilarity = require('string-similarity');

class TelegramScanner {

    /**
     * סורק הודעה טלגרם ומחפש התאמות ב-DB
     * @param {object} ctx - הקונטקסט של גרמי
     */
    async scanMessage(ctx) {
        if (!ctx.from) return;
        return this.scanUser(ctx.from);
    }

    /**
     * לוגיקת הליבה: מקבלת אובייקט User של טלגרם ומבצעת בדיקה
     * @param {object} tgUser - { id, username, first_name, last_name }
     */
    async scanUser(tgUser) {
        const tgId = tgUser.id.toString();
        const username = tgUser.username;
        const firstName = tgUser.first_name || "";
        const lastName = tgUser.last_name || "";
        const fullName = `${firstName} ${lastName}`.trim();

        // בדיקה: האם המשתמש כבר מקושר?
        const snapshot = await db.collection('users').where('platforms.telegram', '==', tgId).limit(1).get();
        if (!snapshot.empty) return; // כבר מקושר, אין מה לעשות

        // בדיקה: האם כבר הוגדר כ"יתום" ברשימה? (כדי למנוע ספאם ללוג)
        const orphanRef = db.collection('system_metadata').doc('telegram_orphans');

        // 1. שמירה למאגר "כל המשתמשים הלא מקושרים" (לסריקה עתידית)
        const allUnlinkedRef = db.collection('system_metadata').doc('telegram_unlinked_users');
        await allUnlinkedRef.set({
            list: {
                [tgId]: {
                    tgId: tgId || "Unknown",
                    username: username || "No Username",
                    displayName: fullName || "Unknown",
                    lastSeen: Date.now()
                }
            }
        }, { merge: true });

        const orphanDoc = await orphanRef.get();
        const orphans = orphanDoc.exists ? orphanDoc.data().list || {} : {};

        if (orphans[tgId]) return; // כבר דיווחנו עליו

        // --- חיפוש התאמה חכמה ---
        const bestMatch = await this.findBestMatch(username, fullName);

        if (bestMatch.confidence > 0.7) {
            log(`🕵️ [Telegram Scanner] התאמה חשודה: ${username || fullName} -> ${bestMatch.name} (${Math.round(bestMatch.confidence * 100)}%)`);

            // שמירה ברשימת היתומים לצורך טיפול בממשק
            await orphanRef.set({
                list: {
                    [tgId]: {
                        tgId: tgId,
                        username: username || "No Username",
                        displayName: fullName,
                        potentialMatchId: bestMatch.id,
                        potentialMatchName: bestMatch.name,
                        confidence: bestMatch.confidence,
                        timestamp: Date.now()
                    }
                }
            }, { merge: true });

            // ✅ דיווח לצוות (Discord Staff Logs)
            this.notifyStaff(tgUser, bestMatch);
        }
    }

    async notifyStaff(tgUser, match) {
        try {
            // טעינת הקליינט בצורה בטוחה (Lazy Load למניעת Circular Dependency)
            const { client } = require('../../discord/index');
            const { EmbedBuilder } = require('discord.js');

            const LOG_CHANNEL_ID = '1302302783856377856'; // ערוץ לוגים ראשי (או ערוץ Staff ייעודי)
            const channel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);

            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle('🕵️ זיהוי משתמש טלגרם חדש')
                    .setColor('#0088cc')
                    .setDescription(`**משתמש:** ${tgUser.username || "ללא שם משתמש"} (${tgUser.first_name})\n**זיהוי:** \`${tgUser.id}\``)
                    .addFields(
                        { name: 'התאמה לדיסקורד', value: match.name || "??", inline: true },
                        { name: 'ביטחון', value: `${Math.round(match.confidence * 100)}%`, inline: true }
                    )
                    .setFooter({ text: 'כנס לדשבורד (Manage -> Telegram) לאישור' });

                await channel.send({ embeds: [embed] });
            }
        } catch (e) {
            console.error('[Scanner Notify Error]', e);
        }
    }

    /**
     * מחפש את המשתמש הכי דומה ב-DB
     */
    async findBestMatch(tgUsername, tgName) {
        // טוען את כל שמות המשתמשים (זה לא אידיאלי מסד ענק, אבל לאלף משתמשים זה כלום זמן)
        // אופטימיזציה: לשמור Cache של שמות ו-ID
        const usersSnapshot = await db.collection('users').select('identity.displayName', 'platforms.discord').get();

        let bestScore = 0;
        let bestUser = null;

        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const discordName = data.identity?.displayName || "";
            if (!discordName) return;

            // בדיקה 1: דמיון לשם משתמש (@Matan_CH vs Matan)
            let score1 = 0;
            if (tgUsername) {
                score1 = stringSimilarity.compareTwoStrings(tgUsername.toLowerCase(), discordName.toLowerCase());
            }

            // בדיקה 2: דמיון לשם מלא (Matan Cohen vs Matan)
            let score2 = stringSimilarity.compareTwoStrings(tgName.toLowerCase(), discordName.toLowerCase());

            const maxScore = Math.max(score1, score2);

            if (maxScore > bestScore) {
                bestScore = maxScore;
                bestUser = { id: doc.id, name: discordName };
            }
        });

        return {
            id: bestUser ? bestUser.id : null,
            name: bestUser ? bestUser.name : null,
            confidence: bestScore
        };
    }
}

module.exports = new TelegramScanner();
