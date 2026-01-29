// 📁 handlers/scheduler.js
const cron = require('node-cron');
const { log } = require('../utils/logger');
const db = require('../utils/firebase'); // ✅ חובה ל-Cooldown

// --- ייבוא המערכות ---
const rankingCore = require('./ranking/core');      // איפוס שבועי
const userManager = require('./users/manager');     // דוחות משתמשים
const presenceHandler = require('../discord/events/presence'); // סנכרון רולים

const TIMERS_REF = db.collection('system_metadata').doc('timers');

let discordClient = null;

module.exports = {
    initScheduler: (client) => {
        discordClient = client;
        log('[Scheduler] ⏳ מאתחל את המשימות המתוזמנות (Cron Jobs)...');

        // 1. סנכרון ראשוני של רולים (Presence) 
        // למקרה שהבוט פספס משהו כשהיה כבוי
        runInitialPresenceScan(client);

        // 2. הגדרת CRON JOBS (משימות מתוזמנות)
        // ---------------------------------------------------

        // --- 🏆 איפוס טבלה שבועית (מוצ"ש ב-21:05) ---
        // מבצע Snapshot מיד לאחר פרסום הלידרבורד כדי להתחיל לספור שבוע חדש
        cron.schedule('5 21 * * 6', async () => {
            await rankingCore.resetWeeklyStats();
        }, { timezone: "Asia/Jerusalem" });

        // --- 👑 הכרזת MVP שבועית (ראשון ב-20:00) ---
        cron.schedule('0 20 * * 0', async () => {
            log('[Scheduler] 👑 מכין את הכרזת ה-MVP השבועית...');
            const rankingBroacaster = require('./ranking/broadcaster');
            const rankingManager = require('./ranking/manager');
            // נשתמש בפונקציה ייעודית במנהל (שנבנה תכף) או נקרא ישירות
            // העדיפות היא לפונקציה מסודרת ב-Manager שמטפלת בהכל
            await rankingManager.announceMVP();
        }, { timezone: "Asia/Jerusalem" });

        // --- 💀 דוח הרחקה חודשי (1 לחודש ב-12:00) ---
        cron.schedule('0 12 1 * *', async () => {
            log('[Scheduler] 💀 מריץ דוח משתמשים לא פעילים...');
            const guild = client.guilds.cache.first();
            if (guild) {
                const stats = await userManager.getInactivityStats(guild);
                log(`[Inactivity] נמצאו ${stats.kickCandidates.length} מועמדים להרחקה.`);
            }
        }, { timezone: "Asia/Jerusalem" });

        // --- 🔥 התראת FOMO (כל 5 דקות) ---
        let lastAlertTime = 0; // נשמר בזיכרון לגיבוי
        const ALERT_COOLDOWN = 60 * 60 * 1000; // 1 שעה (לבקשת המשתמש)

        cron.schedule('*/5 * * * *', async () => {
            if (!client) return;
            try {
                const guild = client.guilds.cache.first();
                if (!guild) return;

                // בדיקת Cooldown מה-DB למניעת ספאם בריסטרט
                const timerDoc = await TIMERS_REF.get();
                const lastFomo = timerDoc.exists ? timerDoc.data().lastFomoAlert : 0;

                if (Date.now() - new Date(lastFomo).getTime() < ALERT_COOLDOWN) return;

                let totalVoiceUsers = 0;
                let activeMembers = [];

                guild.channels.cache.forEach(c => {
                    if (c.type === 2) { // Voice Channel
                        const humans = c.members.filter(m => !m.user.bot);
                        totalVoiceUsers += humans.size;
                        humans.forEach(m => activeMembers.push(m.displayName));
                    }
                });

                if (totalVoiceUsers >= 4) {
                    const names = activeMembers.map(m => m.displayName).join(', '); // ✅ מציג את כולם
                    // const message = `🔥 **אש בחדרים!**\n${names} כבר בדיסקורד.\nרק אתם חסרים יא בוטים.`; // הוחלף בתמונה + כיתוב קצר

                    log(`[Scheduler] 🚀 שליחת התראת FOMO (פעילים: ${totalVoiceUsers})`);

                    // --- גנרציית תמונה ---
                    const graphics = require('./graphics/index'); // מאוחר (Late Import)
                    // אנו צריכים להעביר את האובייקטים של הממברס עבור התמונה
                    // ב-loop למעלה אספנו רק שמות. בוא נאסוף את הממברס המקוריים
                    const allMembers = [];
                    guild.channels.cache.forEach(c => {
                        if (c.type === 2) {
                            const humans = c.members.filter(m => !m.user.bot);
                            humans.forEach(m => allMembers.push(m));
                        }
                    });

                    // ניקח את הערוץ הראשון שיש בו הכי הרבה אנשים בשביל השם
                    // ניקח את הערוץ הראשון שיש בו הכי הרבה אנשים בשביל השם
                    const mainChannel = guild.channels.cache.filter(c => c.type === 2).sort((a, b) => b.members.size - a.members.size).first();
                    let channelName = mainChannel ? mainChannel.name : 'Voice Channels';

                    // 🧹 SANITIZE: Remove ONLY the specific broken char (middle dot ・)
                    // User confirmed Emojis render fine, so we keep them!
                    channelName = channelName
                        .replace(/・/g, ' ') // Replace dot with space for "🎮 main"
                        .trim();

                    // Fallback if name becomes empty
                    if (!channelName) channelName = "Voice Lounge";

                    const imageBuffer = await graphics.voice.generateCard(channelName, allMembers);

                    const { sendToMainGroup } = require('../whatsapp/index');
                    await sendToMainGroup(`🔥 *${channelName}* בוער! בואו להצטרף.`, [], imageBuffer);

                    // עדכון זמן שליחה ב-DB
                    await TIMERS_REF.set({ lastFomoAlert: new Date().toISOString() }, { merge: true });
                }
            } catch (error) {
                console.error('[Scheduler Error] FOMO Loop:', error);
            }
        });

        // --- 🖼️ הזמנה חודשית לטלגרם (1 לחודש ב-12:00) ---
        cron.schedule('0 12 1 * *', async () => {
            const TARGET_CHANNEL_ID = '583575179880431616';
            const TG_LINK = 'https://t.me/+FwQ7Y67QeQE9a7iA';

            try {
                if (!client) return;
                const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
                if (!channel) return log(`[Scheduler] ❌ ערוץ טלגרם לא נמצא (${TARGET_CHANNEL_ID})`);

                // 1. בדיקת פעילות (מונע ספאם)
                const messages = await channel.messages.fetch({ limit: 20 });
                // סופרים כמה הודעות הן ללא הבוט
                const humanMsgCount = messages.filter(m => m.author.id !== client.user.id).size;

                if (humanMsgCount < 5) {
                    return log(`[Scheduler] 🛑 דילוג על הזמנת טלגרם: הערוץ לא פעיל (${humanMsgCount} הודעות אנושיות בלבד).`);
                }

                // 2. שליחת ההזמנה
                const { EmbedBuilder } = require('discord.js');
                const embed = new EmbedBuilder()
                    .setTitle('🚀 הצטרפו לקהילה שלנו בטלגרם!')
                    .setDescription(`כל העדכונים, השיחות והצחוקים קורים שם.\nאל תישארו בחוץ!\n\n**[לחצו כאן להצטרפות](${TG_LINK})**`)
                    .setColor('#0088cc') // Telegram Blue
                    .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/2048px-Telegram_logo.svg.png')
                    .setFooter({ text: 'GamersUnited Telegram' });

                await channel.send({ content: '@everyone', embeds: [embed] });
                log(`[Scheduler] ✈️ נשלחה הזמנה לטלגרם בערוץ ${channel.name}.`);

            } catch (error) {
                console.error('[Scheduler Error] Telegram Invite:', error);
            }
        }, { timezone: "Asia/Jerusalem" });

        // --- 🕵️ סריקת טלגרם חודשית (1 לחודש ב-04:00) ---
        cron.schedule('0 4 1 * *', async () => {
            const scanner = require('../telegram/utils/scanner');
            const db = require('../utils/firebase');

            log('[Scheduler] 🕵️ מריץ סריקת עומק למשתמשי טלגרם לא מקושרים...');

            try {
                const doc = await db.collection('system_metadata').doc('telegram_unlinked_users').get();
                if (!doc.exists) return;

                const users = Object.values(doc.data().list || {});
                let found = 0;

                for (const user of users) {
                    // המרה לפורמט שהסורק מכיר
                    const mockTgUser = {
                        id: user.tgId,
                        username: user.username,
                        first_name: user.displayName.split(' ')[0],
                        last_name: user.displayName.split(' ').slice(1).join(' ')
                    };

                    // הרצת בדיקה מחדש (אם נמצאה התאמה, זה יישמר ב-telegram_orphans)
                    await scanner.scanUser(mockTgUser);
                }

                log(`[Scheduler] ✅ סריקת טלגרם הושלמה. נבדקו ${users.length} משתמשים.`);

            } catch (error) {
                console.error('[Scheduler Error] Telegram Scan:', error);
            }
        }, { timezone: "Asia/Jerusalem" });

        // --- 🎡 גלגל המזל השבועי (חמישי ב-20:00) ---
        cron.schedule('0 20 * * 4', async () => {
            log('[Scheduler] ⏳ Starting Thursday Task: Fortune Wheel (20:00)');
            const fortuneWheel = require('./economy/fortuneWheel'); // Late require
            const { getBot } = require('../telegram/client'); // לוודא שיש בוט?
            // Note: fortuneWheel internal logic uses getBot() from client globally or passed param
            // In fortuneWheel.js we see: async selectWeeklyWinner(clients)

            try {
                const clients = { telegram: getBot() };
                if (!clients.telegram) log('⚠️ [Scheduler] Telegram bot not active for Wheel, running anyway (DB update only).');

                log('[Scheduler] 🎰 מגריל זוכה בגלגל המזל...');
                await fortuneWheel.selectWeeklyWinner(clients);
                log('[Scheduler] ✅ Fortune Wheel Task Completed.');
            } catch (e) {
                log(`❌ [Wheel] Error: ${e.message}`);
            }
        }, { timezone: "Asia/Jerusalem" });

        // --- ✨ Telegram Weekly Spark (חמישי ב-19:00) ---
        cron.schedule('0 19 * * 4', async () => {
            log('[Scheduler] ⏳ Starting Thursday Task: Weekly Spark (19:00)');
            try {
                const campaign = require('../telegram/campaign');
                await campaign.runWeeklySpark();
                log('[Scheduler] ✅ Weekly Spark Task Completed.');
            } catch (e) {
                log(`❌ [Spark] Critical Error: ${e.message}`);
            }
        }, { timezone: "Asia/Jerusalem" });

        // --- 👻 Operation Ghost Protocol (ראשון, שלישי, חמישי ב-20:30) ---
        // נמנעים משישי-שבת. זז ל-20:30 כדי לא להתנגש עם MVP (א') ו-Wheel (ה').
        cron.schedule('30 20 * * 0,2,4', async () => {
            log('[Scheduler] 👻 מפעיל את פרוטוקול הרוחות (Automated Hunt)...');
            const ghostProtocol = require('./users/ghostProtocol');
            await ghostProtocol.startHunt();
        }, { timezone: "Asia/Jerusalem" });

        // --- 🕵️ Intel Newsroom (Every 30 Minutes) ---
        cron.schedule('*/30 * * * *', async () => {
            const intelManager = require('./intel/manager');
            // 🛑 DEBUG: Disabled due to spam complaints. Re-enable after fixing "First Run" logic.
            // await intelManager.checkNews();
        });

        // --- 📊 Daily War Report (Every day at 12:00) ---
        cron.schedule('0 12 * * *', async () => {
            const recap = require('./campaigns/dailyRecap');
            await recap.executeDailyRecap();
        }, { timezone: "Asia/Jerusalem" });

        log('[Scheduler] ✅ כל המשימות תוזמנו בהצלחה.');
    }
};

// פונקציית עזר: סנכרון נוכחות ראשוני
async function runInitialPresenceScan(client) {
    log('[PreseneSync] 🔄 מבצע סנכרון רולים ראשוני...');
    const guild = client.guilds.cache.first();
    if (!guild) return;

    try {
        const members = await guild.members.fetch();
        members.forEach(member => {
            if (member.user.bot) return;
            if (member.presence) {
                presenceHandler.processMember(member, member.presence);
            }
        });
        log(`[PreseneSync] ✅ הסנכרון הסתיים עבור ${members.size} משתמשים.`);
    } catch (e) {
        console.error('[PreseneSync Error]', e);
    }
}