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

    // 3. Process Matches
    const userSnapshot = await db.collection('users').get();
    const users = [];
    userSnapshot.forEach(doc => {
        const d = doc.data();
        users.push({
            id: doc.id,
            aliases: [
                d.identity?.battleTag,
                d.identity?.discordName,
                d.identity?.whatsappName,
                ...(d.identity?.aliases || [])
            ].filter(Boolean).map(a => a.toLowerCase())
        });
    });

    for (const match of args.matches) {
        const cleanName = match.username.toLowerCase();
        const foundUser = users.find(u => u.aliases.some(alias => cleanName.includes(alias) || alias.includes(cleanName)));

        const statData = {
            game: 'Warzone',
            mode: match.mode || 'Unknown',
            kills: match.kills,
            damage: match.damage,
            placement: match.placement || 0,
            evidence_batch: batchId,
            proofUrl: proofUrl, // ✅ Link to Evidence
            timestamp: new Date()
        };

        if (foundUser) {
            // ✅ EXACT MATCH - Save to User DB
            const gameRef = db.collection('users').doc(foundUser.id).collection('games').doc();
            batchOps.set(gameRef, statData);
            savedCount++;
        } else {
            // ❓ UNKNOWN - Save to Pending
            const pendingRef = db.collection('pending_stats').doc();
            batchOps.set(pendingRef, {
                username: match.username,
                ...statData,
                uploadedBy: userId,
            });
            pendingCount++;
        }
    }

    await batchOps.commit();

    let response = `✅ Processed ${args.matches.length} rows.\n`;
    if (savedCount > 0) response += `• ${savedCount} saved to profiles.\n`;
    if (pendingCount > 0) response += `• ${pendingCount} pending review (Unknown users).\n`;

    return response;
}

module.exports = { definition, execute };
