const { sendToMainGroup } = require('./index');
const db = require('../utils/firebase');
const cron = require('node-cron');
const { OpenAI } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const voiceCooldowns = new Map();

async function handleVoiceAlerts(oldState, newState) {
    if (!oldState.channelId && newState.channelId) {
        const channel = newState.channel;
        const member = newState.member;
        
        if (member.user.bot) return;
        if (channel.name.toLowerCase().includes('afk')) return;

        const lastAlert = voiceCooldowns.get(channel.id) || 0;
        const now = Date.now();
        if (now - lastAlert < 15 * 60 * 1000) return;

        voiceCooldowns.set(channel.id, now);

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { 
                        role: "system", 
                        content: "אתה בוט ציני בשם שמעון. חבר בשם USER נכנס עכשיו לחדר CHANNEL בדיסקורד. תכתוב משפט אחד קצר, מצחיק ודוחק שמזמין את כולם בוואטסאפ להצטרף אליו. אל תשתמש במרכאות." 
                    },
                    { 
                        role: "user", 
                        content: `USER=${member.displayName}, CHANNEL=${channel.name}` 
                    }
                ],
                max_tokens: 60,
                temperature: 0.8
            });

            const funnyInvite = completion.choices[0]?.message?.content?.trim();
            console.log(`[Bridge] 📢 Sending AI Alert for ${member.displayName}`);
            await sendToMainGroup(`📢 **המלשין של שמעון:**\n${funnyInvite}`);

        } catch (error) {
            console.error('❌ AI Alert Gen Error:', error.message);
            await sendToMainGroup(`📢 **המלשין של שמעון:** ${member.displayName} נכנס ל-${channel.name}. בואו לארח לו חברה!`);
        }
    }
}

function initDailySummary() {
    cron.schedule('0 10 * * *', async () => {
        console.log('[Bridge] 📰 Generating Daily Summary...');
        try {
            const snapshot = await db.collection('whatsapp_users')
                .orderBy('messageCount', 'desc')
                .limit(3)
                .get();

            if (snapshot.empty) return;

            let summary = "📰 **הבוקר של שמעון - סיכום ביניים:**\n\n🏆 **החופרים של הקבוצה:**\n";
            let i = 1;
            snapshot.forEach(doc => {
                const data = doc.data();
                summary += `${i++}. ${data.displayName} - ${data.messageCount} הודעות\n`;
            });
            summary += "\n🤖 *האח הגדול רואה הכל.*";
            
            await sendToMainGroup(summary);
        } catch (error) {
            console.error('❌ Summary Error:', error);
        }
    });
}

module.exports = { handleVoiceAlerts, initDailySummary };