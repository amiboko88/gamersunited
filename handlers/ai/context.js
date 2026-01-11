// 📁 handlers/ai/context.js
const { getUserRef } = require('../../utils/userUtils');
const dayjs = require('dayjs');

class ContextManager {
    
    async buildContext(userId, platform) {
        try {
            const userRef = await getUserRef(userId, platform);
            const doc = await userRef.get();
            
            // משתמש חדש
            if (!doc.exists) return `[SYSTEM INFO] User Status: NEW (Stranger). Treat with suspicion.`;

            const data = doc.data();
            const identity = data.identity || {};
            const stats = data.stats || {};
            const economy = data.economy || { xp: 0, balance: 0 };
            const meta = data.meta || {};

            // 1. חישוב זומבי (Zombie Check)
            const lastActive = meta.lastActive ? dayjs(meta.lastActive) : dayjs();
            const daysInactive = dayjs().diff(lastActive, 'day');
            let activityStatus = "ACTIVE (Regular)";
            
            if (daysInactive > 60) activityStatus = "DEAD (Absent for 2+ months)";
            else if (daysInactive > 30) activityStatus = "ZOMBIE (Absent for a month)";
            else if (daysInactive > 7) activityStatus = "GHOST (Inactive for a week)";

            // 2. מודעות פיננסית (Financial Awareness)
            const chars = stats.aiCharsUsed || 0;
            const cost = (chars / 1000) * 0.03; // עלות משוערת דולרית
            let costStatus = "NORMAL";
            
            if (cost > 5.0) costStatus = `HIGH COST ($${cost.toFixed(2)}) - COMPLAIN ABOUT IT!`;
            else if (cost < 0.05) costStatus = "LOW COST - Be welcoming";

            // 3. עושר (Whale Check)
            let wealthStatus = "Average";
            if (economy.balance > 20000) wealthStatus = "WHALE (Rich/Vip)";
            if (economy.balance < 50) wealthStatus = "BROKE (Poor)";

            // הרכבת הדוח הסופי ל-AI
            return `
            --- 🕵️ INTELLIGENCE REPORT ---
            Name: ${identity.displayName || 'Unknown'}
            Activity Status: ${activityStatus}
            Financial Cost: ${costStatus}
            Wealth Class: ${wealthStatus} (XP: ${economy.xp})
            Platform: ${platform}
            -----------------------------
            `;

        } catch (error) {
            console.error("Context Build Error:", error);
            return "";
        }
    }
}

module.exports = new ContextManager();