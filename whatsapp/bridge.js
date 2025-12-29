const { sendToMainGroup } = require('./index');
const db = require('../utils/firebase');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const voiceCooldowns = new Map();

async function handleVoiceAlerts(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const now = Date.now();
    const discordId = member.id;

    // --- 🟢 כניסה לחדר ---
    if (!oldState.channelId && newState.channelId) {
        const channel = newState.channel;
        const lastAlert = voiceCooldowns.get(discordId) || 0;
        if (now - lastAlert < 120000) return; // מניעת ספאם
        
        voiceCooldowns.set(discordId, now);

        try {
            // חיפוש טלפון לתיוג
            let whatsappPhone = null;
            const userSnapshot = await db.collection('whatsapp_users')
                .where('discordId', '==', discordId)
                .limit(1)
                .get();

            if (!userSnapshot.empty) whatsappPhone = userSnapshot.docs[0].id;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "חבר נכנס לדיסקורד. תן משפט 'קבלת פנים' בסלנג של 3-6 מילים." },
                    { role: "user", content: `המשתמש ${member.displayName} נכנס לחדר ${channel.name}.` }
                ],
                max_tokens: 50,
                temperature: 0.8
            });

            const aiText = completion.choices[0]?.message?.content?.trim() || "יאללה בלאגן.";
            const textToSend = `🎤 **${member.displayName}** נכנס לדיסקורד!\n${aiText}`;
            
            await sendToMainGroup(textToSend, whatsappPhone ? [whatsappPhone] : []);

        } catch (error) { console.error('Bridge Error:', error.message); }
    }

    // --- 🔴 יציאה (לילה טוב נקבות) ---
    else if (oldState.channelId && !newState.channelId) {
        const channel = oldState.channel;
        const humansLeft = channel.members.filter(m => !m.user.bot).size;
        
        if (humansLeft === 0) {
            const israelTime = new Date(now + (2 * 60 * 60 * 1000)); 
            const ilHour = israelTime.getHours();

            // אם בין חצות ל-6 בבוקר והחדר התרוקן
            if (ilHour >= 0 && ilHour < 6) {
                await sendToMainGroup("🖕"); 
            }
        }
    }
}

function initDailySummary() {} // ריק כרגע

module.exports = { handleVoiceAlerts, initDailySummary };