// 📁 handlers/ranking/manager.js
const cron = require('node-cron');
const db = require('../../utils/firebase');
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

            // 1. שליפת נתוני הטופ 10 מה-DB
            const leaders = await rankingCore.getWeeklyLeaderboard(10);
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

            // 7. עדכון רול MVP (הענקת הגביע לזוכה) 🏆
            // מזהה הרול סופק על ידי המשתמש
            const MVP_ROLE_ID = '1372701819167440957';

            try {
                const guild = this.clients.discord.guilds.cache.first(); // הנחה: הבוט נמצא בשרת אחד ראשי
                if (guild) {
                    const winnerId = leaders[0].id;
                    const role = await guild.roles.fetch(MVP_ROLE_ID).catch(() => null);

                    if (role) {
                        // א. הסרת הרול מכולם (ניקוי הזוכה הקודם)
                        // נשים לב: ה-role.members הוא Collection שצריך למשוך אותו לפעמים
                        // ליתר ביטחון נמשוך מחדש את הרול עם הממברס
                        // בפועל הדרך הכי בטוחה היא לעבור על הממברס של הרול אם הם בקאש, או לשמור מי היה הזוכה הקודם.
                        // אבל הכי פשוט: 
                        for (const member of role.members.values()) {
                            if (member.id !== winnerId) {
                                await member.roles.remove(role, 'Weekly Leaderboard Refresh');
                                log(`[MVP] 🔻 הרול הוסר מ-${member.displayName}`);
                            }
                        }

                        // ב. הענקת הרול לזוכה החדש
                        const winnerMember = await guild.members.fetch(winnerId).catch(() => null);
                        if (winnerMember) {
                            if (!winnerMember.roles.cache.has(MVP_ROLE_ID)) {
                                await winnerMember.roles.add(role, 'Weekly Leaderboard Winner');
                                log(`[MVP] 🏆 👑 ${winnerMember.displayName} הוכתר כ-MVP השבועי החדש!`);

                                // שמירת הנתונים לשימוש עתידי (הכרזה + AI)
                                await db.collection('system_metadata').doc('current_mvp').set({
                                    id: winnerId,
                                    name: winnerMember.displayName,
                                    avatar: leaders[0].avatar, // שימוש באוואטר מהלידרבורד (שכבר עבר עיבוד)
                                    stats: leaders[0].stats,
                                    score: leaders[0].score,
                                    wonAt: new Date().toISOString()
                                });

                                // 💰 מענק כספי (Royal Pass)
                                const bonusAmount = 1000;
                                await db.collection('users').doc(winnerId).set({
                                    economy: {
                                        balance: admin.firestore.FieldValue.increment(bonusAmount),
                                        totalEarnings: admin.firestore.FieldValue.increment(bonusAmount)
                                    }
                                }, { merge: true });
                                log(`[MVP] 💰 הוענק מענק זכייה של ${bonusAmount} למשתמש ${winnerMember.displayName}`);

                                // אופציונלי: שליחת הודעה פרטית לזוכה
                                // await winnerMember.send(`🎉 ברכות! זכית בתואר **MVP השבועי** בשרת GamersUnited!`).catch(() => {});
                            } else {
                                log(`[MVP] ✅ ${winnerMember.displayName} שמר על תוארו כ-MVP שבוע נוסף.`);
                                // עדיין נעדכן את הסטטיסטיקות העדכניות
                                await db.collection('system_metadata').doc('current_mvp').set({
                                    id: winnerId,
                                    name: winnerMember.displayName,
                                    avatar: leaders[0].avatar,
                                    stats: leaders[0].stats,
                                    score: leaders[0].score,
                                    wonAt: new Date().toISOString()
                                }, { merge: true });

                                // גם שומר תואר מקבל מענק (אולי מופחת? כרגע מלא)
                                await db.collection('users').doc(winnerId).set({
                                    economy: { balance: admin.firestore.FieldValue.increment(1000) }
                                }, { merge: true });
                            }
                        } else {
                            log(`[MVP] ⚠️ הזוכה (${winnerId}) לא נמצא בשרת הדיסקורד.`);
                        }
                    } else {
                        log(`[MVP] ❌ רול ה-MVP לא נמצא (ID: ${MVP_ROLE_ID})`);
                    }
                }
            } catch (roleError) {
                log(`[MVP] ❌ שגיאה בניהול רולים: ${roleError.message}`);
                console.error(roleError);
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
     * הכרזת ה-MVP (יום ראשון)
     * שולף את הנתונים השמורים, מייצר תמונה אומנותית, ושולח
     */
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
            const channel = await this.getChannel(guild); // שימוש בפונקציית העזר הקיימת

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
                    `👑 *All Hail The King!*\nקבלו את ה-MVP של השבוע: *${mvpData.name}*!\n\nכבוד מלכים מגיע לו השבוע.`,
                    [],
                    imageBuffer
                );
            }

            log('✅ [MVP] הכרזה נשלחה בהצלחה.');

        } catch (e) {
            console.error('[Ranking] MVP Announce Error:', e);
        }
    }
}

module.exports = new RankingManager();