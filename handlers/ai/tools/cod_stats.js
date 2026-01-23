const crypto = require('crypto');
const db = require('../../../utils/firebase');
const { log } = require('../../../utils/logger');

const definition = {
    type: "function",
    function: {
        name: "save_cod_stats",
        description: "Save extracted COD/Warzone stats to the database. Call this AFTER you have analyzed the scoreboard images and extracted the data. Check exact usernames carefully.",
        parameters: {
            type: "object",
            properties: {
                matches: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            username: { type: "string", description: "Exact in-game username" },
                            kills: { type: "integer" },
                            damage: { type: "integer" },
                            placement: { type: "integer" },
                            mode: { type: "string" }
                        },
                        required: ["username", "kills", "damage"]
                    }
                }
            },
            required: ["matches"]
        }
    }
};

async function execute(args, userId, chatId, imageBuffers) {
    if (!args.matches || args.matches.length === 0) return "❌ No stats provided to save.";
    if (!imageBuffers || imageBuffers.length === 0) return "⚠️ Warning: No image proof provided. Stats NOT saved (Security).";

    let savedCount = 0;
    let pendingCount = 0;
    let ignoredCount = 0;

    // 1. Calculate Hashes for Duplicate Prevention
    const buffers = Array.isArray(imageBuffers) ? imageBuffers : [imageBuffers];
    const hashes = buffers.map(buf => crypto.createHash('md5').update(buf).digest('hex'));

    const batchId = hashes[0].substring(0, 8); // Short ID for this batch

    // Check if ANY of these images were processed before
    const seenSnap = await db.collection('processed_images').where('hash', 'in', hashes).get();
    if (!seenSnap.empty) {
        return "⚠️ Images already processed. Duplicate stats ignored.";
    }

    // 2. Upload Evidence to Storage (The Evidence Locker)
    let proofUrl = null;
    try {
        const admin = require('firebase-admin'); // Singleton
        const bucket = admin.storage().bucket(); // Default bucket
        const file = bucket.file(`evidence/scoreboard_${batchId}.jpg`);
        await file.save(buffers[0], { contentType: 'image/jpeg' });
        await file.makePublic(); // Make it accessible for the Discord Embed
        proofUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    } catch (e) {
        log(`⚠️ [COD Stats] Failed to upload proof: ${e.message}`);
    }

    // 2.5 Validation (The Matan Filter)
    // Check for "Damage 0" or missing - indicates bad OCR or blurry image
    const invalidMatch = args.matches.find(m => !m.damage || m.damage <= 0);
    if (invalidMatch) {
        return "ROAST_ME: ❌ Image quality is garbage. Cannot read Damage stats. Tell them to learn to take a screenshot.";
    }

    // 2.6 Mark images as processed (After validation passes)
    const batchOps = db.batch();
    hashes.forEach(hash => {
        const ref = db.collection('processed_images').doc(hash);
        batchOps.set(ref, { timestamp: new Date(), uploadedBy: userId });
    });

    // 3. Process Matches (Smart Linking Logic 🧠)
    const userSnapshot = await db.collection('users').get();
    const users = [];
    userSnapshot.forEach(doc => {
        const d = doc.data();
        users.push({
            id: doc.id,
            displayName: d.identity?.displayName || "Unknown",
            aliases: [
                d.identity?.battleTag,
                d.identity?.discordName,
                d.identity?.whatsappName,
                d.identity?.displayName,
                ...(d.identity?.aliases || [])
            ].filter(Boolean).map(a => a.toLowerCase().trim())
        });
    });

    const suggestions = [];

    for (const match of args.matches) {
        const cleanName = match.username.toLowerCase().trim();

        // A. Exact Match Strategy
        const foundUser = users.find(u => u.aliases.some(alias => alias === cleanName || alias.includes(cleanName) || cleanName.includes(alias)));

        const statData = {
            game: 'Warzone',
            mode: match.mode || 'Unknown',
            kills: match.kills,
            damage: match.damage,
            placement: match.placement || 0,
            evidence_batch: batchId,
            proofUrl: proofUrl,
            timestamp: new Date()
        };

        if (foundUser) {
            // ✅ EXACT/STRONG MATCH - Save to User DB
            const gameRef = db.collection('users').doc(foundUser.id).collection('games').doc();
            batchOps.set(gameRef, statData);
            savedCount++;
        } else {
            // ❓ UNKNOWN - Logic for Smart Suggestion
            // Check for fuzzy match (e.g. "MatanCh" vs "Matan")
            const fuzzyCandidate = users.find(u => {
                // Check if 70% of characters match or simple containment implies strong link
                return u.aliases.some(alias =>
                    (cleanName.length > 3 && alias.includes(cleanName)) ||
                    (alias.length > 3 && cleanName.includes(alias))
                );
            });

            if (fuzzyCandidate) {
                suggestions.push({
                    unknown: match.username,
                    candidateName: fuzzyCandidate.displayName,
                    candidateId: fuzzyCandidate.id
                });
            }

            // Save to Pending anyway
            const pendingRef = db.collection('pending_stats').doc();
            batchOps.set(pendingRef, {
                username: match.username,
                ...statData,
                uploadedBy: userId,
                suggestedUserId: fuzzyCandidate ? fuzzyCandidate.id : null // Help the Linker later
            });
            pendingCount++;
        }
    }

    await batchOps.commit();

    // 4. GENERATE GRAPHIC CARD 🎨
    try {
        const graphics = require('../../graphics/statsCard');
        const imageBuffer = await graphics.generateMatchCard(args.matches);

        if (chatId) {
            if (chatId.includes('@')) {
                const { getWhatsAppSock } = require('../../../whatsapp/index');
                const sock = getWhatsAppSock();
                if (sock) {
                    await sock.sendMessage(chatId, {
                        image: imageBuffer,
                        caption: `📊 **דוח משחק - ${new Date().toLocaleTimeString('he-IL')}**\nעובד ע"י שמעון AI`,
                        mimetype: 'image/png'
                    });
                }
            }
        }
    } catch (gErr) {
        log(`❌ [COD Stats] Graphics Error: ${gErr.message}`);
    }

    // 5. Return Text Summary
    let response = `✅ הנתונים נשמרו בהצלחה ודוח גרפי נשלח לקבוצה.`;

    const isGroup = chatId && chatId.includes('@g.us');

    if (pendingCount > 0 && !isGroup) {
        const unknownNames = args.matches
            .filter(m => !users.find(u => u.aliases.some(alias => m.username.toLowerCase().includes(alias) || alias.includes(m.username.toLowerCase()))))
            .map(m => m.username);

        if (suggestions.length > 0) {
            response += `\n\n💡 **הצעת שיוך חכמה:**\n`;
            suggestions.forEach(s => {
                response += `- האם **${s.unknown}** הוא **${s.candidateName}**? \n  👉 כתוב: \`!link ${s.unknown} @${s.candidateId}\`\n`;
            });
        }

        const trulyUnknown = unknownNames.filter(n => !suggestions.some(s => s.unknown === n));
        if (trulyUnknown.length > 0) {
            response += `\n⚠️ **לא זוהו:** [${trulyUnknown.join(', ')}].`;
        }
    }

    // 6. Notify Admin via Discord DM (Real-Time Alert 🚨)
    if (pendingCount > 0) {
        try {
            // Import Client dynamically to avoid circular deps
            const { client } = require('../../../discord/index');
            const adminId = process.env.DISCORD_ADMIN_ID || '524302700695912506'; // Matan's ID

            const adminUser = await client.users.fetch(adminId).catch(() => null);
            if (adminUser) {
                const unknownNames = args.matches
                    .filter(m => !users.find(u => u.aliases.some(alias => m.username.toLowerCase().includes(alias) || alias.includes(m.username.toLowerCase()))))
                    .map(m => `\`${m.username}\``);

                let dmText = `⚠️ **[Scan Report]** Found **${pendingCount}** unknown users in recent scan.\nUnknowns: ${unknownNames.join(', ')}`;

                if (suggestions.length > 0) {
                    dmText += `\n💡 **System Suggestions:** ${suggestions.length} potential fuzzy matches found.`;
                }

                dmText += `\n👉 Go to **Discord Dashboard** -> **Review Stats** to link them.`;

                await adminUser.send(dmText);
            }
        } catch (dmErr) {
            log(`❌ [COD Stats] Failed to DM Admin: ${dmErr.message}`);
        }
    }

    return response;
}

module.exports = { definition, execute };
