const cron = require('node-cron');
const db = require('../../utils/firebase');
const admin = require('firebase-admin'); // ✅ Added missing import
const rankingCore = require('./core');
// const rankingRenderer = require('./render'); // ❌ נמחק
const graphics = require('../graphics/index'); // ✅ המערכת הגרפית החדשה
const rankingBroadcaster = require('./broadcaster');
const { log } = require('../../utils/logger');

// רפרנס למסמך ששומר את ה-ID של ההודעה הקבועה לעריכה
const META_REF = db.collection('system_metadata').doc('weeklyLeaderboard');

class RankingManager {
    constructor() {
        this.clients = {};
    }

    /**
     * אתחול המנהל עם כל הקליינטים מה-index.js
     */
    init(discordClient, waSock, waGroupId, telegramBot) {
        this.clients = {
            discord: discordClient,
            whatsapp: waSock,
            waGroupId,
            telegram: telegramBot
        };

        // תזמון: בכל מוצ"ש (יום 6) בשעה 21:00
        cron.schedule('0 21 * * 6', async () => {
            log('⏰ [Ranking] Starting Weekly Leaderboard Automation...');
            await this.runWeeklyProcess();
        }, {
            timezone: "Asia/Jerusalem"
        });


        log('[RankingManager] ✅ מודול דירוג אוטומטי נטען (מוצ"ש 20:00).');

        // בדיקה חד פעמית: אם אין MVP שמור, ננסה לשחזר אותו (למקרה של שדרוג קוד)
        this.checks(discordClient);
    }

    async checks(client) {
        // המתנה שהבוט יעלה
        setTimeout(async () => {
            const doc = await db.collection('system_metadata').doc('current_mvp').get();
            if (!doc.exists) {
                log('⚠️ [Manager] לא זוהה MVP שמור (עקב שדרוג). מבצע שחזור...');
                await this.seedCurrentMVP();
            }
        }, 10000);
    }

    /**
     * פונקציה להרצה ידנית (לבדיקות או אם השרת היה כבוי בזמן הקרון)
     */
    async forceRun() {
        log('⚠️ [Ranking] Force running Weekly Leaderboard...');
        await this.runWeeklyProcess();
    }

    /**
     * התהליך המרכזי: שליפה, רינדור והפצה
     */
    async runWeeklyProcess() {
        try {
            log('📊 [Ranking] מחשב לידרבורד שבועי...');

            // 1. שליפת נתוני הטופ 5 מה-DB (לבקשת המשתמש: טבלה גדולה ומרוכזת)
            const leaders = await rankingCore.getWeeklyLeaderboard(5);
            if (!leaders || leaders.length === 0) {
                log('⚠️ [Ranking] No data found (Empty). Skipping broadcast.');
                return;
            }

            // 2. חישוב מספר השבוע (מסונכרן לפורמט הפקודה)
            const weekNum = this._getWeekNumber();

            // 3. יצירת התמונה (Puppeteer) דרך המנוע החדש ✅
            log(`🎨 [Ranking] מייצר תמונה לשבוע #${weekNum}...`);
            const imageBuffer = await graphics.leaderboard.generateImage(leaders, weekNum);

            if (!imageBuffer) {
                log('❌ [Ranking] Image generation failed.');
                return;
            }

            // 4. שליפת מזהה ההודעה הקודמת לעריכה מדיסקורד
            let lastMessageId = null;
            const metaDoc = await META_REF.get();
            if (metaDoc.exists) {
                lastMessageId = metaDoc.data().messageId;
            }

            // 5. הפצה לדיסקורד (עריכה חכמה)
            const newMessageId = await rankingBroadcaster.broadcastDiscord(
                this.clients.discord,
                imageBuffer,
                weekNum,
                lastMessageId
            );

            // 6. הפצה לשאר הפלטפורמות (שליחה כהודעה חדשה)
            await rankingBroadcaster.broadcastOthers(this.clients, imageBuffer, weekNum);

            // 7. חלוקת פרסים (Tiered Rewards) ועדכון רולים 🏆💰
            // Rewards: 1st=1000, 2nd=500, 3rd=250, 4th=100, 5th=100
            const REWARDS = [1000, 500, 250, 100, 100];
            let reportText = `💰 *דוח חלוקת רווחים שבועי:*\n`;
            let totalDistributed = 0;

            const MVP_ROLE_ID = '1372701819167440957';
            const guild = this.clients.discord.guilds.cache.first();

            for (let i = 0; i < leaders.length; i++) {
                const user = leaders[i];
                const amount = REWARDS[i] || 0; // אם יש יותר משתמשים מפרסים, מקבלים 0

                if (amount > 0) {
                    // Update DB with Bonus + Stats
                    const updateData = {
                        economy: {
                            balance: admin.firestore.FieldValue.increment(amount),
                            totalEarnings: admin.firestore.FieldValue.increment(amount)
                        }
                    };

                    // MVP Special Handling
                    if (i === 0) {
                        updateData.stats = { mvpWins: admin.firestore.FieldValue.increment(1) };
                        // Save Metadata
                        await db.collection('system_metadata').doc('current_mvp').set({
                            id: user.id,
                            name: user.name,
                            avatar: user.avatar,
                            stats: user.stats,
                            score: user.score,
                            wonAt: new Date().toISOString()
                        });
                        reportText += `👑 *${user.name}:* ₪${amount}\n`;
                    } else {
                        const medal = i === 1 ? '🥈' : i === 2 ? '🥉' : i === 3 ? '4️⃣' : '5️⃣';
                        reportText += `${medal} *${user.name}:* ₪${amount}\n`;
                    }

                    await db.collection('users').doc(user.id).set(updateData, { merge: true });
                    totalDistributed += amount;
                }
            }

            reportText += `\n💵 *סה"כ חולק:* ₪${totalDistributed.toLocaleString()}\n_תבזבזו בחכמה._`;

            // Role Management (MVP Only)
            if (guild) {
                try {
                    const winnerId = leaders[0].id;
                    const role = await guild.roles.fetch(MVP_ROLE_ID).catch(() => null);
                    if (role) {
                        // Remove from everyone
                        for (const member of role.members.values()) {
                            if (member.id !== winnerId) await member.roles.remove(role);
                        }
                        // Add to winner
                        const winnerMember = await guild.members.fetch(winnerId).catch(() => null);
                        if (winnerMember && !winnerMember.roles.cache.has(MVP_ROLE_ID)) {
                            await winnerMember.roles.add(role);
                        }
                    }
                } catch (e) { console.error('Role Error:', e); }
            }

            // 8. שמירת המזהה החדש ב-DB לעדכון בשבוע הבא
            if (newMessageId) {
                await META_REF.set({
                    messageId: newMessageId,
                    lastUpdate: new Date().toISOString(),
                    week: weekNum
                }, { merge: true });
                log(`✅ [Ranking] המערכת עודכנה ב-DB עם Message ID: ${newMessageId}`);
            }

        } catch (error) {
            log(`❌ [Ranking] Weekly Leaderboard Error: ${error.message}`);
            console.error(error);
        }
    }

    /**
     * פונקציית עזר פנימית לחישוב מספר השבוע
     */
    _getWeekNumber() {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    /**
     * פונקציית עזר למציאת הערוץ הראשי להודעות
     */
    async getChannel(guild) {
        // 1. נסות למצוא ערוץ לפי שם גנרי
        const channelName = 'general'; // או כל שם אחר שמוגדר אצלכם
        let channel = guild.channels.cache.find(c => c.name === channelName && c.type === 0); // 0 = GUILD_TEXT

        // 2. אם לא נמצא, נסה את הערוץ הראשון בשרת שהוא טקסט
        if (!channel) {
            channel = guild.channels.cache.filter(c => c.type === 0).first();
        }

        // 3. (אופציונלי) אם יש משתנה סביבה ל-CHANNEL_ID אפשר להשתמש בו
        // if (process.env.DISCORD_MAIN_CHANNEL_ID) ...

        return channel;
    }

    async announceMVP() {
        try {
            log('👑 [Ranking] מתחיל תהליך הכרזת MVP (Artistic Mode)...');

            // 1. שליפת הזוכה השמור
            const snapshot = await db.collection('system_metadata').doc('current_mvp').get();
            if (!snapshot.exists) {
                log('⚠️ [MVP] לא נמצאו נתוני MVP שמורים. מדלג.');
                return;
            }

            const mvpData = snapshot.data();

            // 2. יצירת התמונה (האומנותית)
            const imageBuffer = await graphics.mvp.generateCard(mvpData);
            if (!imageBuffer) return log('❌ [MVP] כשל בייצור תמונה.');

            // 3. שליחה לדיסקורד
            const guild = this.clients.discord.guilds.cache.first();
            // User Request: General Chat ID explicitly
            const GENERAL_CHAT_ID = '583575179880431616';
            const channel = await guild.channels.fetch(GENERAL_CHAT_ID).catch(() => null);

            if (channel) {
                await channel.send({
                    content: `👑 **ALL HAIL THE KING!** 👑\nקבלו את ה-MVP של השבוע, <@${mvpData.id}>!`,
                    files: [{ attachment: imageBuffer, name: 'mvp_royal.png' }]
                });
            }

            // 4. שליחה לוואטסאפ (אם קיים)
            if (this.clients.whatsapp) {
                const { sendToMainGroup } = require('../../whatsapp/index');
                await sendToMainGroup(
                    `👑 *All Hail The King!*\nקבלו את ה-MVP של השבוע: *${mvpData.name}*!\n\n${reportText}`,
                    [],
                    imageBuffer
                );
            }

            // 5. שליחה לטלגרם (אם קיים)
            // Telegram Target: Using the same general logic or hardcoded if needed.
            // Assuming 'telegram_main_group' or specific ID.
            if (this.clients.telegram) {
                const TG_CHAT_ID = '-1002231267597'; // Hardcoded Main Group ID (from memory or config)
                // If not sure, I'll use the one from config, but user provided hardcoded usually.
                // Let's assume the bot is in the group.
                try {
                    await this.clients.telegram.sendPhoto(TG_CHAT_ID, imageBuffer, {
                        caption: `👑 *All Hail The King!*\nקבלו את ה-MVP של השבוע: *${mvpData.name}*!\n\nכבוד מלכים מגיע לו השבוע.`
                    });
                } catch (tgError) {
                    log(`⚠️ [MVP] Telegram Send Failed (Check ID): ${tgError.message}`);
                }
            }

            log('✅ [MVP] הכרזה נשלחה בהצלחה.');

        } catch (e) {
            console.error('[Ranking] MVP Announce Error:', e);
        }
    }

    /**
     * 🛠️ כלי חירום למעבר גרסה
     * מאכלס ידנית את ה-MVP הנוכחי על בסיס נתונים מצטברים (כי השבוע אופס)
     * יש להריץ את זה פעם אחת ידנית מדיסקורד/קונסול
     */
    async seedCurrentMVP() {
        try {
            log('🛠️ [Ranking] מפעיל אכלוס ידני של MVP (Seed)...');

            // שימוש ב-core כדי לשלוף לידרבורד מצטבר (Lifetime)
            const leaders = await rankingCore.getWeeklyLeaderboard(1, true); // true = forceLifetime

            if (!leaders || leaders.length === 0) {
                log('❌ [Seed] לא נמצאו משתמשים.');
                return;
            }

            const winner = leaders[0];

            await db.collection('system_metadata').doc('current_mvp').set({
                id: winner.id,
                name: winner.name,
                avatar: winner.avatar,
                stats: winner.stats,
                score: winner.score,
                wonAt: new Date().toISOString() // כאילו זכה עכשיו
            });

            log(`✅ [Seed] הוזרק MVP ידני: ${winner.name} (ID: ${winner.id})`);

        } catch (e) {
            console.error('[Seed] Error:', e);
        }
    }
}

module.exports = new RankingManager();