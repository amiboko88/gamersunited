const db = require('../../../utils/firebase');
const { log } = require('../../../utils/logger');
const codGraphics = require('../../../handlers/graphics/codProfile');

const definition = {
    type: "function",
    function: {
        name: "show_cod_profile",
        description: "Show a PERSONAL WARZONE Operator Card. ⚠️ RESTRICTION: Use ONLY when specific context of 'Warzone', 'COD', 'K/D' is present. If user says 'Show my stats' or 'Profile' generically -> DO NOT CALL. Ask 'In which game?'.",
        parameters: {
            type: "object",
            properties: {
                targetUser: { type: "string", description: "Name or ID of user to show (Default: Self)" },
                period: { type: "string", enum: ["week", "all", "yesterday"], description: "Time period (Default: week)" }
            },
            required: []
        }
    }
};

async function execute(args, userId, chatId) {
    try {
        const { getWhatsAppSock } = require('../../../whatsapp/index');
        const period = args.period || 'week';
        const targetSearch = args.targetUser;

        // 1. Resolve Target User
        let targetId = userId;
        let targetName = "Unknown";
        let avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";

        if (targetSearch) {
            // Search logic (reused from query_stats roughly)
            const usersSnap = await db.collection('users').get();
            const found = usersSnap.docs.find(doc => {
                const d = doc.data();
                const aliases = [
                    d.identity?.battleTag,
                    d.identity?.discordName,
                    d.identity?.displayName,
                    ...(d.identity?.aliases || [])
                ].filter(Boolean).map(a => a.toLowerCase());
                return aliases.some(a => a.includes(targetSearch.toLowerCase()));
            });

            if (found) {
                targetId = found.id;
                const d = found.data();
                targetName = d.identity?.displayName;
                avatarUrl = d.identity?.avatar || d.identity?.avatar_discord || avatarUrl;
            } else {
                return `Couldn't find user: ${targetSearch}`;
            }
        } else {
            // Self - Robust Lookup Strategy 🧠
            // The 'userId' from WhatsApp is a Phone Number.
            // But the Games might be on a different document (e.g., Discord ID) if accounts are linked.

            // 1. Try Direct Doc (Phone ID)
            let userDoc = await db.collection('users').doc(userId).get();

            if (userDoc.exists) {
                // Check if it's a "shell" that points to a main profile?
                // For now, assume this is it, BUT also check by identity query.
                if (!userDoc.data().games && !userDoc.data().gamertag) {
                    // Try finding by identity field (reverse lookup)
                    // If this phone is listed as 'whatsappPhone' on another doc
                    const snap = await db.collection('users').where('identity.whatsappPhone', '==', userId).get();
                    if (!snap.empty) {
                        userDoc = snap.docs[0];
                        targetId = userDoc.id; // Switch target to the Main Doc
                    }
                }
            } else {
                // Phone doc doesn't exist? Try identity lookup
                const snap = await db.collection('users').where('identity.whatsappPhone', '==', userId).get();
                if (!snap.empty) {
                    userDoc = snap.docs[0];
                    targetId = userDoc.id;
                }
            }

            if (userDoc.exists) {
                const d = userDoc.data();
                targetName = d.identity?.displayName;
                avatarUrl = d.identity?.avatar || d.identity?.avatar_discord || avatarUrl;
            }
        }

        // 2. Fetch Stats
        let queryDate = new Date();
        let periodText = "WEEKLY OPS";

        if (period === 'all') {
            queryDate = new Date(0);
            periodText = "CAREER OPS";
        } else if (period === 'yesterday') {
            queryDate.setDate(queryDate.getDate() - 1);
            queryDate.setHours(0, 0, 0, 0);
            periodText = "YESTERDAY";
        } else {
            queryDate.setDate(queryDate.getDate() - 7);
        }

        // Fetch games
        const gamesSnap = await db.collection('users').doc(targetId).collection('games')
            .where('timestamp', '>=', queryDate)
            .get();

        if (gamesSnap.empty) {
            return `No Warzone games found for ${targetName} (${period}). Go play some games!`;
        }

        // 3. Aggregate
        let stats = { kills: 0, damage: 0, matches: 0, score: 0 };
        gamesSnap.forEach(doc => {
            const d = doc.data();
            stats.kills += (d.kills || 0);
            stats.damage += (d.damage || 0);
            stats.score += (d.score || 0);
            stats.matches++;
        });

        // Calc K/D
        stats.kdr = (stats.kills / (stats.matches || 1)).toFixed(2);

        // 4. Generate Image
        log(`📸 [COD Profile] Generating card for ${targetName}...`);
        const imageBuffer = await codGraphics.generateProfileCard(targetName, avatarUrl, stats, periodText);

        if (!imageBuffer) return "Failed to generate card.";

        // 5. Send
        const sock = getWhatsAppSock();
        if (sock && chatId) {
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: `🪖 **OPERATOR CARD:** ${targetName}\n📊 K/D: ${stats.kdr} | Matches: ${stats.matches}`
            });
            return `Displaying profile card for ${targetName}.`;
        }

        return "Error: Socket unavailable.";

    } catch (error) {
        log(`❌ [ShowProfile] Error: ${error.message}`);
        return `Error: ${error.message}`;
    }
}

module.exports = { definition, execute };
