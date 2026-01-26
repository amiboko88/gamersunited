const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const graphics = require('../graphics/statsCard');
const dayjs = require('dayjs');

// Config
const SESSION_WINDOW_HOURS = 6;
const MIN_STATS_FOR_SUMMARY = 2; // Don't summarize a single quick game

async function handleSessionEnd(guild, voiceChannel) {
    const now = dayjs();
    const startTime = now.subtract(SESSION_WINDOW_HOURS, 'hour').toDate();

    log(`🌅 [Session] Channel ${voiceChannel.name} is empty. Checking for recent activity since ${startTime.toLocaleTimeString()}...`);

    try {
        // 1. Find recent processed batches (Evidence)
        const batchesSnap = await db.collection('processed_images')
            .where('timestamp', '>=', startTime)
            .get();

        if (batchesSnap.empty) {
            log(`💤 [Session] No stats uploaded recently. No summary needed.`);
            return;
        }

        // 2. Fetch all games linked to these batches OR just recent games generally
        // Easier: Fetch all games created in this time window across ALL users.
        // This is expensive if we scan all users.
        // Better: We stored `evidence_batch` in the game docs.
        // But we can't query subcollections easily without Collection Group Query (requires index).

        // Alternative: Use `pending_stats`? No, they are moved.
        // Let's use `processed_images` to check *if* we should bother, 
        // then define the participants based on who was in the voice channel?
        // Or just Collection Group query for 'games' if index exists.

        // Let's try Collection Group query (might fail if index missing).
        // Fallback: Query only users who were recently active in voice (we have that info somewhere? User meta).

        // Let's try the direct approach: Query known gamers.
        // 🚨 Collection Group Index creation takes time.
        // 💡 Hack: We can just query `users` who have `meta.lastActive` > startTime?

        const activeUsersSnap = await db.collection('users')
            .where('meta.lastActive', '>=', startTime.toISOString())
            .get();

        if (activeUsersSnap.empty) return;

        let allGames = [];

        for (const doc of activeUsersSnap.docs) {
            const games = await doc.ref.collection('games')
                .where('timestamp', '>=', startTime)
                .get();

            games.forEach(g => {
                allGames.push({ ...g.data(), username: doc.data().identity?.displayName || 'Unknown' });
            });
        }

        if (allGames.length < MIN_STATS_FOR_SUMMARY) {
            log(`💤 [Session] Only found ${allGames.length} games. Skipping summary.`);
            return;
        }

        log(`📊 [Session] Generating summary for ${allGames.length} games...`);

        // 3. Aggregate Stats
        const aggregatedMap = new Map();

        allGames.forEach(g => {
            const name = g.username;
            if (!aggregatedMap.has(name)) {
                aggregatedMap.set(name, {
                    username: name,
                    kills: 0,
                    damage: 0,
                    score: 0,
                    matches: 0
                });
            }
            const entry = aggregatedMap.get(name);
            entry.kills += (g.kills || 0);
            entry.damage += (g.damage || 0);
            entry.score += (g.score || 0);
            entry.matches++;
        });

        const summaryStats = Array.from(aggregatedMap.values());

        // 4. Generate Graphic (with protection)
        log(`🎨 [Session] Rendering graphics...`);

        const imageBuffer = await Promise.race([
            graphics.generateMatchCard(summaryStats, {
                isAggregated: true,
                totalGames: allGames.length
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout generating graphics")), 20000))
        ]);

        log(`✅ [Session] Graphics generated (${imageBuffer.length} bytes). Sending...`);

        // 5. Send to Discord (General or specific channel)
        // Try to find a text channel named "general", "chat", or "warzone"
        const targetChannel = guild.channels.cache.find(c =>
            c.type === 0 && // Text Channel
            ['general', 'chat', 'warzone', 'דיבורים', 'gamers-united'].includes(c.name.toLowerCase())
        );

        if (targetChannel) {
            await targetChannel.send({
                content: `🌅 **סיכום סשן לילה**\nנראה שסיימתם לשחק. הנה הסיכום שלכם להערב:`,
                files: [{ attachment: imageBuffer, name: 'session_summary.png' }]
            });
        }

        // 6. Send to WhatsApp (Optional - via Bridge)
        // Not implemented here to avoid circular dep hell, but possible.

    } catch (error) {
        log(`❌ [Session] Error generating summary: ${error.message}`);
    }
}

module.exports = { handleSessionEnd };
