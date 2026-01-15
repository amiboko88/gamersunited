// 📁 handlers/fifo/engine.js
const { OpenAI } = require('openai');
// connection to whatsapp removed from top level to prevent circular dependency
const { getUserData } = require('../../utils/userUtils'); // שליפת נתונים לאיזון
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class FifoEngine {
    constructor() {
        this.activeMatches = new Map(); // GuildID -> MatchData
    }

    /**
     * מערבב שחקנים ומייצר קבוצות
     */
    async createSquads(members, groupSize) {
        // ערבוב פישר-ייטס קלאסי
        const shuffled = [...members].sort(() => 0.5 - Math.random());
        const squads = [];

        while (shuffled.length > 0) {
            // אם נשאר שחקן בודד, נצרף אותו לקבוצה האחרונה (Overfill)
            if (shuffled.length === 1 && squads.length > 0) {
                squads[squads.length - 1].push(shuffled.pop());
            } else {
                squads.push(shuffled.splice(0, groupSize));
            }
        }
        return squads;
    }

    /**
     * מייצר שמות לקבוצות באמצעות AI ושולח התראה לוואטסאפ
     */
    async generateMatchMetadata(guildId, squads) {
        try {
            // בניית תיאור לקבוצות עבור ה-AI
            const teamsDesc = squads.map((squad, i) => {
                return `Group ${i + 1}: ${squad.map(m => m.displayName).join(', ')}`;
            }).join('\n');

            // בקשת שמות מגניבים מה-AI
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{
                    role: "system",
                    content: `אתה כרוז בקרב גיימינג. תן שמות קצרים (2-3 מילים), מצחיקים וקרביים בעברית ל-${squads.length} הקבוצות הבאות על בסיס השמות של השחקנים. החזר רק רשימת שמות מופרדת בפסיקים.`
                }, {
                    role: "user",
                    content: teamsDesc
                }],
                max_tokens: 50
            });

            const aiNames = completion.choices[0].message.content.split(',').map(s => s.trim());

            // הצמדת השמות לקבוצות
            const enrichedSquads = squads.map((members, i) => ({
                name: aiNames[i] || `צוות ${i + 1}`,
                members: members
            }));

            // 🔥 שליחת התראה לוואטסאפ 🔥
            this.broadcastToWhatsApp(enrichedSquads);

            return enrichedSquads;

        } catch (error) {
            console.error('Fifo AI Error:', error);
            // Fallback במקרה של שגיאה
            return squads.map((members, i) => ({ name: `צוות ${String.fromCharCode(65 + i)}`, members }));
        }
    }

    async broadcastToWhatsApp(squads) {
        let message = `⚔️ **הקרב מתחיל! חלוקת קבוצות FIFO** ⚔️\n\n`;

        squads.forEach(squad => {
            message += `🛡️ *${squad.name}*\n`;
            message += `${squad.members.map(m => `• ${m.displayName}`).join('\n')}\n\n`;
        });

        message += `🔥 יאללה בלגאן!`;

        // שליחה לוואטסאפ דרך הפונקציה המרכזית
        const { sendToMainGroup } = require('../../whatsapp/index');
        sendToMainGroup(message).catch(e => console.error('WhatsApp Broadcast Error:', e));
    }
}

module.exports = new FifoEngine();