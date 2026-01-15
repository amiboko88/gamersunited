// 📁 discord/events/voiceBridge.js
// const { sendToMainGroup } = require('../../whatsapp/index'); -- CIRCULAR FIX
const db = require('../../utils/firebase');
const graphics = require('../../handlers/graphics/index'); // ✅ ייבוא המערכת הגרפית
const { log } = require('../../utils/logger');

// 🛑 רשימה שחורה: ערוצים ששמעון מתעלם מהם (סודיים / AFK)
const IGNORED_CHANNELS = [
    '1396779274173943828', // <-- שים פה את ה-ID של החדר הסודי שלך!
    '800783674223624252'   // חדר AFK אם יש
];

// הגדרות FOMO
const MIN_USERS_TO_ALERT = 2; // מינימום אנשים כדי לדווח
const ALERT_COOLDOWN = 15 * 60 * 1000; // לא לדווח על אותו חדר יותר מפעם ב-15 דקות

const roomCooldowns = new Map();

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

        // יצירת תמונה (דרך המערכת הגרפית החדשה) ✅
        const imageBuffer = await graphics.voice.generateCard(channel.name, Array.from(members.values()));

        // ניסוח הודעה
        const text = `🔥 **אש בחדרים!**\nהחבר'ה התחברו ל-${channel.name}.\n${names.join(', ')} כבר בפנים.\nאיפה אתם? כנסו עכשיו.`;

        // שליחה
        const { sendToMainGroup } = require('../../whatsapp/index');
        await sendToMainGroup(text, mentions, imageBuffer);
        log(`📢 [VoiceBridge] דווח על אקשן בחדר ${channel.name} (${count} משתמשים)`);

    } catch (error) {
        log(`❌ [VoiceBridge] Error: ${error.message}`);
    }
}

module.exports = { handleVoiceStateUpdate };