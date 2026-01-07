// 📁 discord/events/voiceBridge.js
const { sendToMainGroup } = require('../../whatsapp/index');
const db = require('../../utils/firebase');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const voiceCooldowns = new Map();

/**
 * מאזין לכניסות לחדרים בדיסקורד ומדווח לוואטסאפ
 * (יושב בצד של הדיסקורד, כי הוא Discord Event)
 */
async function handleVoiceStateUpdate(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const discordId = member.id;
    const now = Date.now();

    // בדיקת כניסה לחדר (רק אם לא היה בחדר קודם)
    if (!oldState.channelId && newState.channelId) {
        
        // Cooldown של 5 דקות כדי לא לחפור
        const lastAlert = voiceCooldowns.get(discordId) || 0;
        if (now - lastAlert < 300000) return;
        voiceCooldowns.set(discordId, now);

        const channelName = newState.channel.name;
        const displayName = member.displayName;

        try {
            // שליפת המשתמש כדי לדעת אם לתייג אותו בוואטסאפ
            let whatsappTag = null;
            const userDoc = await db.collection('users').doc(discordId).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                if (data.platforms?.whatsapp) {
                    whatsappTag = data.platforms.whatsapp; 
                }
            }

            // AI משעשע לקבלת הפנים
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "אתה בוט ציני. חבר נכנס לדיסקורד. תן משפט קצר (3-5 מילים) שיגרום לאנשים בוואטסאפ לקנא או לצחוק עליו." },
                    { role: "user", content: `המשתמש ${displayName} נכנס לחדר ${channelName}.` }
                ],
                max_tokens: 60
            });
            
            const aiText = completion.choices[0]?.message?.content?.trim() || "יאללה בלאגן.";

            // הרכבת ההודעה
            const message = `🎤 **${displayName}** נכנס לדיסקורד!\nחדר: ${channelName}\n💬 ${aiText}`;
            
            // שיגור לוואטסאפ
            const mentions = whatsappTag ? [whatsappTag] : [];
            await sendToMainGroup(message, mentions);

        } catch (error) {
            console.error('❌ [VoiceBridge] Error:', error.message);
        }
    }
}

module.exports = { handleVoiceStateUpdate };