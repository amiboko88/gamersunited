// 📁 handlers/ai/tools/identity.js
const { getUserRef } = require('../../../utils/userUtils'); // ✅ תיקון נתיב: עליה של 3 רמות
const graphics = require('../../graphics/index'); // גם כאן הנתיב היה גבולי, עדיף לדייק

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "get_user_profile",
            description: "Get user profile card (XP, Level, Balance). Use when user asks 'my stats' or 'who am i'.",
            parameters: {
                type: "object",
                properties: {
                    target_user: { type: "string", description: "Name/Phone/ID (optional, default is sender)" }
                }
            }
        }
    },

    async execute(args, userId, chatId) {
        // ייבוא דינמי כדי למנוע מעגליות אם קיימת, ותיקון נתיב לוואטסאפ
        const { getSocket } = require('../../../whatsapp/socket');
        const sock = getSocket();

        try {
            // שימוש ב-userId כפי שהוא (הפונקציה getUserRef כבר יודעת לטפל בו)
            const userRef = await getUserRef(userId, 'whatsapp');
            const doc = await userRef.get();

            if (!doc.exists) return "לא מצאתי נתונים עליך. תתחיל לדבר!";

            const data = doc.data();
            const name = data.identity?.displayName || "Gamer";
            const level = data.economy?.level || 1;
            const xp = data.economy?.xp || 0;
            const avatar = data.identity?.avatarURL || "https://cdn.discordapp.com/embed/avatars/0.png";

            // יצירת הכרטיס
            const cardBuffer = await graphics.profile.generateLevelUpCard(name, level, xp, avatar);

            if (sock && chatId && cardBuffer) {
                await sock.sendMessage(chatId, {
                    image: cardBuffer,
                    caption: `📊 **הפרופיל של ${name}**\n💰 יתרה: ₪${data.economy?.balance || 0}`
                });
                return "שלחתי את כרטיס הפרופיל.";
            }

            return `רמה: ${level} | XP: ${xp}`;

        } catch (err) {
            console.error("Identity Tool Error:", err);
            return "שגיאה בשליפת פרופיל.";
        }
    }
};