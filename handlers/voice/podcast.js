// 📁 handlers/voice/podcast.js
const { log } = require('../../utils/logger');
const ttsEngine = require('./openaiTTS'); 
const { getUserData } = require('../../utils/userUtils'); 
const audioManager = require('../audio/manager'); 
const { OpenAI } = require('openai'); // ✅ הוספת OpenAI לגנרציית תסריט

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MIN_USERS = 3;
const COOLDOWN = 30 * 60 * 1000; 
let lastPodcastTime = 0;
let activeChannelId = null;

class PodcastManager {

    async handleVoiceStateUpdate(oldState, newState) {
        const channel = newState.channel;
        
        if (activeChannelId && oldState.channelId === activeChannelId) {
            const currentMembers = oldState.channel.members.filter(m => !m.user.bot).size;
            if (currentMembers < MIN_USERS) {
                log('[Podcast] אין מספיק קהל. עוצר.');
                if (audioManager.stop) audioManager.stop(oldState.guild.id);
                activeChannelId = null;
            }
            return;
        }

        if (!channel || activeChannelId) return;
        const now = Date.now();
        if (now - lastPodcastTime < COOLDOWN) return;

        const humans = Array.from(channel.members.filter(m => !m.user.bot).values());
        if (humans.length >= MIN_USERS) {
            lastPodcastTime = now;
            activeChannelId = channel.id;
            const victim = humans[Math.floor(Math.random() * humans.length)];
            await this.playPersonalPodcast(channel, victim);
        }
    }

    async playPersonalPodcast(voiceChannel, member) {
        try {
            log(`[Podcast] מגנרט תסריט AI עבור ${member.displayName}...`);
            const userData = await getUserData(member.id, 'discord');
            
            // איסוף הנתונים מה-DB לתוך ה-Prompt
            const roasts = userData?.brain?.roasts || [];
            const facts = userData?.brain?.facts?.map(f => f.content) || [];
            
            // --- 🧠 OpenAI Script Generation ---
            const prompt = `
            You are writing a short, funny, and mean podcast script for a Discord bot named "Shimon" and his co-host "Shirly".
            The target (victim) is ${member.displayName}.
            Here is what we know about him:
            Facts: ${facts.join(', ')}
            Common Roasts: ${roasts.join(', ')}
            
            The script should be in Hebrew. 
            Shimon is cynical, "Arsi", and aggressive. 
            Shirly is sharp, sarcastic, and backs Shimon up.
            
            Format:
            shimon: [text]
            shirly: [text]
            shimon: [text]
            
            Keep it under 4 lines total. Make it very funny and relevant to the facts.
            `;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "system", content: "You are a professional roast writer for a Discord podcast." }, { role: "user", content: prompt }]
            });

            const rawScript = completion.choices[0].message.content;
            const script = rawScript.split('\n').filter(l => l.includes(':')).map(line => {
                const [speaker, ...textParts] = line.split(':');
                return { speaker: speaker.trim().toLowerCase(), text: textParts.join(':').trim() };
            });

            // יצירת האודיו ושליחה לנגן
            const audioFiles = await ttsEngine.synthesizeConversation(script, member);
            for (const file of audioFiles) {
                await audioManager.playLocalFile(voiceChannel.guild.id, voiceChannel.id, file);
            }

            setTimeout(() => { activeChannelId = null; }, 60000);

        } catch (error) {
            log(`❌ Podcast Script Error: ${error.message}`);
            activeChannelId = null;
        }
    }
}

module.exports = new PodcastManager();