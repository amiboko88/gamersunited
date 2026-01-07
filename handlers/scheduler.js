// 📁 handlers/scheduler.js
const cron = require('node-cron');
const { log } = require('../utils/logger');
const path = require('path');
const { createCanvas, loadImage } = require('canvas'); // חזר לשימוש עבור ההזמנה החודשית
const { sendToMainGroup } = require('../whatsapp/index'); // חיבור לוואטסאפ

let discordClient = null; // ✅ משתנה גלובלי למניעת קריסה

module.exports = {
    initScheduler: (client) => {
        discordClient = client; // ✅ שמירת הקליינט ברגע האתחול
        log('[Scheduler] מערכת תזמון הופעלה (FOMO + Monthly Invites).');

        // --- 1. FOMO Engine: בדיקה כל 5 דקות האם יש אקשן ---
        let lastAlertTime = 0;
        const ALERT_COOLDOWN = 4 * 60 * 60 * 1000; // 4 שעות קולדאון

        cron.schedule('*/5 * * * *', async () => {
            if (!discordClient) return; // הגנה מקריסה

            try {
                const guild = discordClient.guilds.cache.first();
                if (!guild) return;

                // ספירת אנשים בחדרים (מסננים בוטים)
                let totalVoiceUsers = 0;
                let activeMembers = [];
                
                guild.channels.cache.forEach(c => {
                    if (c.type === 2) { // Voice Channel
                        const humans = c.members.filter(m => !m.user.bot);
                        totalVoiceUsers += humans.size;
                        humans.forEach(m => activeMembers.push(m.displayName));
                    }
                });

                // התנאי: יותר מ-3 אנשים בחדרים + עבר זמן מההתראה האחרונה
                if (totalVoiceUsers >= 4 && (Date.now() - lastAlertTime > ALERT_COOLDOWN)) {
                    lastAlertTime = Date.now();
                    
                    const names = activeMembers.slice(0, 3).join(', ');
                    const message = `🔥 **אש בחדרים!**\n${names} ועוד ${totalVoiceUsers - 3} כבר בדיסקורד.\nרק אתם חסרים יא בוטים.\n\n👇 כנסו לפה:\nhttps://discord.gg/YOUR_INVITE_LINK`;

                    log(`[Scheduler] שליחת התראת FOMO (פעילים: ${totalVoiceUsers})`);
                    
                    // שליחה לוואטסאפ
                    await sendToMainGroup(message);
                }

            } catch (error) {
                console.error('[Scheduler Error] FOMO Loop:', error);
            }
        });

        // --- 2. Monthly Invite: הזמנה חודשית (ב-1 לחודש ב-12:00) ---
        cron.schedule('0 12 1 * *', async () => {
            try {
                const bgPath = path.join(__dirname, '../assets/gamersunitedpic.jpg');
                const logoPath = path.join(__dirname, '../assets/logo.png');

                if (require('fs').existsSync(bgPath)) {
                    const canvas = createCanvas(1000, 500);
                    const ctx = canvas.getContext('2d');
                    
                    // טעינת תמונות
                    const bg = await loadImage(bgPath);
                    ctx.drawImage(bg, 0, 0, 1000, 500);
                    
                    // שכבת כהות
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                    ctx.fillRect(0, 0, 1000, 500);

                    // טקסט
                    ctx.font = 'bold 60px sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.fillText('החודש בטלגרם', 500, 200);
                    
                    ctx.font = '40px sans-serif';
                    ctx.fillStyle = '#FFD700';
                    ctx.fillText('הקבוצה הסודית מחכה לכם', 500, 300);

                    // לוגו קטן בצד
                    if (require('fs').existsSync(logoPath)) {
                        const logo = await loadImage(logoPath);
                        ctx.drawImage(logo, 850, 400, 100, 100);
                    }

                    const buffer = canvas.toBuffer();
                    
                    // שליחה לוואטסאפ עם תמונה
                    await sendToMainGroup("📢 **החודש בטלגרם!**\nבואו, שקט שם (מדי).\n🔗 לינק-להצטרפות", [], buffer);
                    log('[Scheduler] נשלחה הזמנה חודשית.');
                }
            } catch (e) {
                console.error('[Scheduler Error] Monthly Invite:', e);
            }
        });
    }
};