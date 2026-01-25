// 📁 handlers/ai/context.js
const { getUserRef } = require('../../utils/userUtils');
const db = require('../../utils/firebase');
const dayjs = require('dayjs');

class ContextManager {

    async buildContext(userId, platform) {
        let context = `\n# 🌍 Real-World Context\n`;

        // 1. Fetch Warzone Intel (Cached/Live)
        try {
            const intelDoc = await db.collection('system_data').doc('warzone_intel').get();

            // 🕒 Time Context (CRITICAL for AI Awareness)
            const now = dayjs().locale('he');
            const timeContext = `
            📅 **REAL WORLD TIME:** ${now.format('DD/MM/YYYY')} (Day: ${now.format('dddd')})
            ⏰ **CLOCK:** ${now.format('HH:mm')}
            `;
            context += timeContext;

            if (intelDoc.exists) {
                const data = intelDoc.data();
                const lastPatch = data.latest_patch_title || "Unknown Update";
                const lastDate = data.latest_patch_date ? data.latest_patch_date : "Unknown Date";

                // Group by Mode
                const grouped = {};
                if (data.meta_weapons && Array.isArray(data.meta_weapons)) {
                    data.meta_weapons.forEach(w => {
                        // Support both string and object formats, preferring object
                        const name = w.name || w; // simple string fallback
                        const code = w.build_code || 'Ask User to Check Link';
                        const mode = w.mode || 'Warzone (General)';

                        if (!grouped[mode]) grouped[mode] = [];
                        grouped[mode].push(`   - 🔫 **${name}**\n     Code: \`${code}\`\n     Info: ${w.details || ''}`);
                    });
                }

                let metaList = "";
                for (const [mode, weapons] of Object.entries(grouped)) {
                    metaList += `\n📌 **${mode} META:**\n${weapons.join('\n')}\n`;
                }

                // Data Found:
                context += `
                =============================================================
                🚨 **WARZONE LIVE INTELLIGENCE (HIGHEST PRIORITY)** 🚨
                =============================================================
                YOUR INTERNAL TRAINING DATA IS OUTDATED (2023/4). DO NOT USE IT.
                USE ONLY THE REAL-TIME DATA BELOW:

                📅 **LATEST UPDATE:** "${lastPatch}" (Date: ${data.latest_patch_date || 'N/A'})
                🔗 **Patch Notes:** ${data.latest_patch_url}
                📝 **Summary:** ${data.latest_patch_summary || 'N/A'}

                🔥 **CURRENT META BUILDS (REAL-TIME):**
                ${metaList}

                👉 **INSTRUCTIONS:**
                1. If asked about "Meta" or "Best guns", READ FROM THE LIST ABOVE.
                2. If the weapon is NOT in this list, say "לא מופיע אצלי במטא כרגע, אבל תבדוק את..." and suggest a listed one.
                3. DO NOT invent build codes like "S07-...". Only use the exact codes listed above.
                4. If the generic "Kastov" comes to mind, IGNORE IT unless it's in the list below.
                =============================================================
                `;
            } else {
                // 🛑 EMPTY DATA - KILL SWITCH
                context += `
                =============================================================
                ⚠️ **WARZONE INTELLIGENCE OFFLINE** ⚠️
                =============================================================
                ERROR: The Intel Database is currently empty or failed to sync.
                
                👉 **INSTRUCTIONS FOR YOU:**
                1. IF the user asks about "Meta", "Builds", or "Updates":
                   - DO NOT ANSWER from your internal training data. It is old.
                   - ANSWER EXACTLY: "מצטער, המודיעין שלי לא מעודכן כרגע. אני עושה סנכרון מחדש, נסה עוד דקה."
                   - DO NOT invent weapons like "Lachmann Sub" or "Kastov".
                =============================================================
                `;
            }
        } catch (e) {
            console.error('Error fetching intel context:', e);
        }

        // 2. User Specific Context
        context += `\n### 👤 User Info (${platform}):\n`;

        try {
            const userRef = await getUserRef(userId, platform);
            const doc = await userRef.get();

            // טיפול במשתמש חדש לגמרי
            if (!doc.exists) {
                context += `[SYSTEM INFO] User Status: NEW (Stranger). Treat with suspicion.`;
                return context;
            }

            const data = doc.data();
            const identity = data.identity || {};
            const stats = data.stats || {};
            const economy = data.economy || { xp: 0, balance: 0, level: 1 };
            const meta = data.meta || {};

            // 1. חישוב זומבי (Zombie Check)
            const lastActive = meta.lastActive ? dayjs(meta.lastActive) : dayjs();
            const daysInactive = dayjs().diff(lastActive, 'day');
            let activityStatus = "ACTIVE (Regular)";

            if (daysInactive > 60) activityStatus = "Inactive (Long time)";
            else if (daysInactive > 30) activityStatus = "Away (Month)";
            else if (daysInactive > 7) activityStatus = "Quiet (Week)";

            // 2. מודעות פיננסית (Financial Awareness) - שוחזר! ✅
            const chars = stats.aiCharsUsed || 0;
            // חישוב גס: 3 סנט ל-1000 טוקנים (בערך)
            const cost = (chars / 1000) * 0.03;
            let costStatus = "NORMAL";

            if (cost > 5.0) costStatus = `HIGH COST ($${cost.toFixed(2)}) - COMPLAIN ABOUT IT!`;
            else if (cost < 0.05) costStatus = "LOW COST - Be welcoming";

            // 3. עושר (Whale Check)
            let wealthStatus = "Average";
            if (economy.balance > 20000) wealthStatus = "WHALE (Rich/Vip)";
            else if (economy.balance < 50) wealthStatus = "BROKE (Poor)";

            // 4. זמן דיבור (המרת דקות לשעות)
            const voiceHours = ((stats.voiceMinutes || 0) / 60).toFixed(1);

            // 5. Recent Gaming Performance (The Roast Material 🍖)
            let gamesContext = "";
            try {
                // Determine Identity (Phone or Discord ID)
                const targetRef = await getUserRef(userId, platform);
                const gamesSnap = await targetRef.collection('games')
                    .orderBy('timestamp', 'desc')
                    .limit(5) // Last 5 games
                    .get();

                if (!gamesSnap.empty) {
                    const games = gamesSnap.docs.map(g => g.data());
                    const lastGame = games[0];

                    // Analyst Logic
                    const totalKills = games.reduce((acc, g) => acc + (g.kills || 0), 0);
                    const avgKills = (totalKills / games.length).toFixed(1);
                    const totalDmg = games.reduce((acc, g) => acc + (g.damage || 0), 0);
                    const avgDmg = (totalDmg / games.length).toFixed(0);

                    gamesContext = `
            -- Recent Gaming Performance (LAST 5 GAMES) --
            Avg Kills: ${avgKills} | Avg Damage: ${avgDmg}
            Last Game: ${lastGame.kills} Kills, ${lastGame.damage} Dmg (${dayjs(lastGame.timestamp.toDate()).locale('he').fromNow()})
            Play Style: ${avgKills > 5 ? "DEMON 😈" : avgKills < 2 ? "BOT 🤖" : "Soldier 🫡"}
            `;
                } else {
                    gamesContext = `\n            -- Gaming --\n            No recent stats recorded (Safe from roasting... for now).`;
                }
            } catch (err) { }

            // הרכבת הדוח הסופי ל-AI
            return `
            --- 🕵️ INTELLIGENCE REPORT ---
            Name: ${identity.displayName || 'Unknown'}
            Activity: ${activityStatus} (Last active: ${daysInactive} days ago)
            Level: ${economy.level} (XP: ${economy.xp})
            Balance: ₪${economy.balance} (${wealthStatus})
            
            -- Usage Stats --
            Voice Time: ${voiceHours} hours
            Messages Sent: ${stats.messagesSent || 0}
            API Cost: ${costStatus}

            ${gamesContext}
            
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