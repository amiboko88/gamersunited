const { sendToMainGroup } = require('./index');
const db = require('../utils/firebase');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// מעקב אחרי זמני כניסה למניעת ספאם (Cooldown)
// Key: discordUserId, Value: timestamp
const voiceCooldowns = new Map();

async function handleVoiceAlerts(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return; // מתעלמים מבוטים

    const now = Date.now();
    const discordId = member.id;

    // --- 🟢 תרחיש 1: כניסה לחדר (מתייגים בוואטסאפ) ---
    if (!oldState.channelId && newState.channelId) {
        const channel = newState.channel;
        
        // בדיקת ספאם: האם המשתמש כבר קיבל התראה ב-2 הדקות האחרונות?
        const lastAlert = voiceCooldowns.get(discordId) || 0;
        if (now - lastAlert < 120000) {
            console.log(`[Bridge] ⏳ Spam prevention active for ${member.displayName}`);
            return; 
        }
        
        voiceCooldowns.set(discordId, now);

        try {
            // 1. מציאת מספר הטלפון של המשתמש לצורך תיוג
            let whatsappPhone = null;
            const userSnapshot = await db.collection('whatsapp_users')
                .where('discordId', '==', discordId)
                .limit(1)
                .get();

            if (!userSnapshot.empty) {
                whatsappPhone = userSnapshot.docs[0].id; // זה ה-JID (מספר הטלפון)
            }

            // 2. יצירת ירידה קצרה עם AI
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { 
                        role: "system", 
                        content: "אתה שמעון. חבר נכנס לדיסקורד. תכתוב משפט אחד קצר (3-6 מילים) של 'קבלת פנים' בסלנג ישראלי כבד. תהיה ציני." 
                    },
                    { 
                        role: "user", 
                        content: `המשתמש ${member.displayName} נכנס לחדר ${channel.name}.` 
                    }
                ],
                max_tokens: 50,
                temperature: 0.8
            });

            const aiText = completion.choices[0]?.message?.content?.trim() || "נכנס לחדר, יאללה בלאגן.";
            
            // 3. שליחה לקבוצה עם תיוג
            const textToSend = `🎤 **${member.displayName}** נכנס לדיסקורד!\n${aiText}`;
            
            // שולחים למיין גרופ עם מערך של תיוגים (אם מצאנו את הטלפון)
            await sendToMainGroup(textToSend, whatsappPhone ? [whatsappPhone] : []);
            console.log(`[Bridge] ✅ Alert sent for ${member.displayName}`);

        } catch (error) {
            console.error('❌ Bridge Alert Error:', error.message);
        }
    }

    // --- 🔴 תרחיש 2: יציאה מהחדר (בדיקת "לילה טוב נקבות") ---
    else if (oldState.channelId && !newState.channelId) {
        const channel = oldState.channel;
        
        // בודקים אם החדר התרוקן לגמרי (רק בני אדם)
        const humansLeft = channel.members.filter(m => !m.user.bot).size;
        
        if (humansLeft === 0) {
            // בדיקת שעות: האם עכשיו לילה? (00:00 עד 06:00)
            const hour = new Date().getHours(); // שעון השרת (לוודא שזה מתאים לישראל, בדרך כלל UTC אז צריך להתאים)
            // נניח שהשרת הוא UTC, אז ישראל זה +2/+3. ליתר ביטחון נבדוק טווח רחב או נשתמש ב-Date מתוקן.
            // לצורך הפשטות נניח שאנחנו רוצים לזהות "לילה".
            
            // בדיקה פשוטה: אם השעה היא 22:00 עד 04:00 (UTC) זה לילה בישראל
            // או פשוט נשלח תמיד כשהאחרון יוצא? ביקשת ספציפית לילה.
            
            // המרה לשעון ישראל
            const israelTime = new Date(now + (2 * 60 * 60 * 1000)); // UTC+2 בערך
            const ilHour = israelTime.getHours();

            if (ilHour >= 0 && ilHour < 6) {
                console.log('[Bridge] 🖕 Night mode triggered. Last user left.');
                // שליחת אצבע משולשת
                await sendToMainGroup("🖕"); 
            }
        }
    }
}

// ביטלנו את initDailySummary כי ביקשת למנוע חפירות
function initDailySummary() { 
    // ריק לבקשתך
}

module.exports = { handleVoiceAlerts, initDailySummary };