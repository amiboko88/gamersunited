// 📁 discord/events/voiceBridge.js
const { sendToMainGroup } = require('../../whatsapp/index');
const db = require('../../utils/firebase');
const puppeteer = require('puppeteer'); // חובה לרינדור התמונה
const { log } = require('../../utils/logger');

// 🛑 רשימה שחורה: ערוצים ששמעון מתעלם מהם (סודיים / AFK)
const IGNORED_CHANNELS = [
    '1396779274173943828', // <-- שים פה את ה-ID של החדר הסודי שלך!
    '800783674223624252'  // חדר AFK אם יש
];

// הגדרות FOMO
const MIN_USERS_TO_ALERT = 2; // מינימום אנשים כדי לדווח
const ALERT_COOLDOWN = 15 * 60 * 1000; // לא לדווח על אותו חדר יותר מפעם ב-15 דקות

const roomCooldowns = new Map();

/**
 * מייצר תמונה מעוצבת של "שידור חי" עם האווטרים של המשתמשים
 */
async function generateVoiceCard(channelName, members) {
    try {
        const avatarsHtml = members.map(m => `
            <div class="avatar-wrapper">
                <img src="${m.user.displayAvatarURL({ extension: 'png', size: 128 })}" class="avatar" />
                <div class="name">${m.displayName}</div>
            </div>
        `).join('');

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;900&display=swap');
                body {
                    margin: 0; padding: 0;
                    width: 600px; height: 300px;
                    background: linear-gradient(135deg, #1e1e1e, #111);
                    font-family: 'Heebo', sans-serif;
                    color: white;
                    display: flex; flex-direction: column;
                    justify-content: center; align-items: center;
                    border: 4px solid #5865F2; /* Discord Color */
                    border-radius: 20px;
                }
                .status-badge {
                    background: #FF4444;
                    color: white;
                    padding: 5px 15px;
                    border-radius: 50px;
                    font-weight: 900;
                    font-size: 14px;
                    margin-bottom: 15px;
                    box-shadow: 0 0 15px rgba(255, 68, 68, 0.6);
                    animation: pulse 2s infinite;
                }
                .channel-name {
                    font-size: 32px;
                    font-weight: 900;
                    margin-bottom: 20px;
                    text-transform: uppercase;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.5);
                }
                .users-container {
                    display: flex;
                    gap: 15px;
                }
                .avatar-wrapper {
                    display: flex; flex-direction: column; align-items: center;
                }
                .avatar {
                    width: 70px; height: 70px;
                    border-radius: 50%;
                    border: 3px solid #25D366; /* WhatsApp Green hint */
                    object-fit: cover;
                }
                .name {
                    margin-top: 5px;
                    font-size: 14px;
                    color: #ccc;
                    max-width: 80px;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                }
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.7; }
                    100% { opacity: 1; }
                }
            </style>
        </head>
        <body>
            <div class="status-badge">● LIVE NOW</div>
            <div class="channel-name">🔊 ${channelName}</div>
            <div class="users-container">
                ${avatarsHtml}
            </div>
        </body>
        </html>`;

        const browser = await puppeteer.launch({ 
            headless: 'new', 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 600, height: 300, deviceScaleFactor: 2 });
        await page.setContent(html);
        const buffer = await page.screenshot({ type: 'png' });
        await browser.close();
        return buffer;

    } catch (e) {
        log(`❌ [VoiceRender] Error: ${e.message}`);
        return null;
    }
}

/**
 * הלוגיקה הראשית
 */
async function handleVoiceStateUpdate(oldState, newState) {
    const channel = newState.channel;
    
    // 1. אם זו לא כניסה לחדר (או שזה יציאה) - מתעלמים
    if (!channel || (oldState.channelId === newState.channelId)) return;

    // 2. סינון ערוצים סודיים
    if (IGNORED_CHANNELS.includes(channel.id)) return;

    // 3. ספירת אנשים (ללא בוטים)
    const members = channel.members.filter(m => !m.user.bot);
    const count = members.size;

    // 4. בדיקת FOMO: מדווחים רק שיש 2 אנשים ומעלה
    if (count < MIN_USERS_TO_ALERT) return;

    // 5. בדיקת Cooldown (כדי לא לחפור כל פעם שמישהו נכנס לחדר מלא)
    const now = Date.now();
    const lastAlert = roomCooldowns.get(channel.id) || 0;
    if (now - lastAlert < ALERT_COOLDOWN) return;

    // --- יש אקשן! מתחילים לדווח ---
    roomCooldowns.set(channel.id, now);

    try {
        // איסוף שמות ותיוגים
        const names = [];
        const mentions = [];

        for (const [id, member] of members) {
            names.push(member.displayName);
            
            // בדיקה אם יש מספר וואטסאפ לתיוג
            const userDoc = await db.collection('users').doc(id).get();
            if (userDoc.exists) {
                const waPhone = userDoc.data().platforms?.whatsapp;
                if (waPhone) mentions.push(waPhone);
            }
        }

        // יצירת תמונה
        const imageBuffer = await generateVoiceCard(channel.name, Array.from(members.values()));

        // ניסוח הודעה
        const text = `🔥 **אש בחדרים!**\nהחבר'ה התחברו ל-${channel.name}.\n${names.join(', ')} כבר בפנים.\nאיפה אתם? כנסו עכשיו.`;

        // שליחה
        await sendToMainGroup(text, mentions, imageBuffer);
        log(`📢 [VoiceBridge] דווח על אקשן בחדר ${channel.name} (${count} משתמשים)`);

    } catch (error) {
        log(`❌ [VoiceBridge] Error: ${error.message}`);
    }
}

module.exports = { handleVoiceStateUpdate };