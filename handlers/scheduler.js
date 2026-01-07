// הוסף בראש הקובץ
const { sendToMainGroup } = require('../whatsapp/index');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const cron = require('node-cron'); // ✅ חובה כדי שהתזמונים יעבדו

// 📢 FOMO Engine: בדיקה כל 5 דקות האם יש אקשן בדיסקורד
let lastAlertTime = 0;
const ALERT_COOLDOWN = 4 * 60 * 60 * 1000; // לא לשלוח יותר מפעם ב-4 שעות כדי לא להציק

cron.schedule('*/5 * * * *', async () => {
    const guild = client.guilds.cache.first(); // השרת הראשי
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

        // שליחה לוואטסאפ (המקום הפעיל)
        await sendToMainGroup(message);
        
        // שליחה לטלגרם (לנסות להעיר את המתים)
        // require('../telegram/index').api.sendMessage(TG_CHAT_ID, message);
    }
});

// 🖼️ Monthly Invite: הזמנה חודשית לטלגרם (ב-1 לחודש)
cron.schedule('0 12 1 * *', async () => {
    try {
        const bgPath = path.join(__dirname, '../assets/gamersunitedpic.jpg');
        const logoPath = path.join(__dirname, '../assets/logo.png');

        // בדיקה שהקבצים קיימים
        if (require('fs').existsSync(bgPath)) {
            const canvas = createCanvas(1000, 500);
            const ctx = canvas.getContext('2d');
            const bg = await loadImage(bgPath);
            
            ctx.drawImage(bg, 0, 0, 1000, 500);
            
            // שכבת כהות
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, 1000, 500);

            // טקסט
            ctx.font = 'bold 60px sans-serif'; // או הפונט העברי שלך
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText('החודש בטלגרם', 500, 200);
            ctx.font = '40px sans-serif';
            ctx.fillStyle = '#FFD700';
            ctx.fillText('הקבוצה הסודית מחכה לכם', 500, 300);

            if (require('fs').existsSync(logoPath)) {
                const logo = await loadImage(logoPath);
                ctx.drawImage(logo, 850, 400, 100, 100);
            }

            const buffer = canvas.toBuffer();
            
            // שליחה
            await sendToMainGroup("📢 **החודש בטלגרם!**\nבואו, שקט שם (מדי).\n🔗 לינק-להצטרפות", [], buffer);
        }
    } catch (e) {
        console.error('Monthly Invite Error:', e);
    }
});