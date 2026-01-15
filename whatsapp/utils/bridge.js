// 📁 whatsapp/utils/bridge.js
// const { sendToMainGroup } = require('../../index'); -- CIRCULAR FIX
const db = require('../../utils/firebase');
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
        if (now - lastAlert < 120000) return; // 2 דקות קולדאון

        voiceCooldowns.set(discordId, now);

        try {
            // ✅ חיפוש משתמש ב-users ובדיקה אם יש לו מספר וואטסאפ
            let whatsappPhone = null;
            const userDoc = await db.collection('users').doc(discordId).get();

            if (userDoc.exists) {
                const data = userDoc.data();
                if (data.platforms && data.platforms.whatsapp) {
                    whatsappPhone = data.platforms.whatsapp.includes('@')
                        ? data.platforms.whatsapp
                        : `${data.platforms.whatsapp}@s.whatsapp.net`;
                }
            }

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

            const { sendToMainGroup } = require('../../index');
            await sendToMainGroup(textToSend, whatsappPhone ? [whatsappPhone] : []);

        } catch (error) { console.error('Bridge Error:', error.message); }
    }

    // --- 🔴 יציאה ---
    else if (oldState.channelId && !newState.channelId) {
        const channel = oldState.channel;
        const humansLeft = channel.members.filter(m => !m.user.bot).size;

        if (humansLeft === 0) {
            const israelTime = new Date(now + (2 * 60 * 60 * 1000));
            const ilHour = israelTime.getHours();

            if (ilHour >= 22 || ilHour < 5) {
                const { sendToMainGroup } = require('../../index');
                await sendToMainGroup(`😴 הדיסקורד התרוקן. לילה טוב נקבות.`);
            }
        }
    }
}

module.exports = { handleVoiceAlerts };