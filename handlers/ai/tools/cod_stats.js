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
        // Return structured signal so Media Handler can trigger AI interaction
        return JSON.stringify({
            type: "duplicate",
            message: "Images already processed.",
            batchId: batchId
        });
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
    const invalidMatch = args.matches.find(m => {
        const dmg = parseInt(m.damage) || 0;
        const kills = parseInt(m.kills) || 0;

        // Rule 1: Zero Damage implies bad scan (unless 0 kills)
        if (kills > 0 && dmg <= 0) return true;

        // Rule 2: Impossible Ratio (e.g. 10 Kills with 400 Damage)
        // Minimum reasonable damage per kill is ~100 (stealing kills).
        // If Kills > 3 and Ratio < 100, it's suspicious.
        if (kills > 3 && (dmg / kills) < 100) return true;

        return false;
    });

    if (invalidMatch) {
        log(`❌ [COD Stats] Rejected Ratio: ${invalidMatch.kills} Kills / ${invalidMatch.damage} Damage`);
        return `❌ **נתונים לא הגיוניים!**\nהמערכת זיהתה יחס בלתי אפשרי (למשל ${invalidMatch.kills} הריגות עם ${invalidMatch.damage} נזק).\n👉 נסה לצלם שוב חד וברור, או כתוב לי בפרטי אם זה באג.`;
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
    // Store resolved names for the graphic to ensure consistency
    const resolvedNamesMap = new Map();

    for (const match of args.matches) {
        const cleanName = match.username.toLowerCase().trim();

        // A. Exact & Strict Match Strategy
        // Priority 1: Exact Match (e.g. "ami" === "ami")
        let foundUser = users.find(u => u.aliases.some(alias => {
            const isMatch = alias === cleanName;
            if (isMatch) matchReason = `Exact match on alias '${alias}'`;
            return isMatch;
        }));

        // Priority 1.5: Simplified Equality (Handle "Yogi ツ" vs "Yogi")
        // Removes all non-alphanumeric chars (keep only a-z, 0-9) and checks equal
        if (!foundUser) {
            const simpleClean = cleanName.replace(/[^a-z0-9]/g, '');
            if (simpleClean.length >= 2) { // Safety: Don't match single letters like "a"
                foundUser = users.find(u => u.aliases.some(alias => {
                    const simpleAlias = alias.replace(/[^a-z0-9]/g, '');
                    const isMatch = simpleAlias === simpleClean;
                    if (isMatch) matchReason = `Simplified match ('${alias}' -> '${simpleAlias}' vs '${simpleClean}')`;
                    return isMatch;
                }));
            }
        }

        // Priority 2: Word Boundary/Token Match (e.g. "ami" matches "ami cohen" but NOT "familia")
        if (!foundUser) {
            foundUser = users.find(u => u.aliases.some(alias => {
                const tokens = alias.split(/[\s-_]+/); // Split by space, dash, underscore
                const isMatch = tokens.includes(cleanName);
                if (isMatch) matchReason = `Token match on alias '${alias}'`;
                return isMatch;
            }));
        }

        // Store the result for the graphic later
        if (foundUser) {
            // log(`✅ [SmartLink] Linked '${match.username}' -> ${foundUser.displayName} (${matchReason})`); // Too verbose
            resolvedNamesMap.set(match.username, foundUser.displayName);
        } else {
            // Sanitize raw username for display if not found
            // Use Unicode-aware regex to keep Hebrew/English letters but remove emojis/junk
            // \p{L} = Any Unicode Letter, \p{N} = Number
            const safeName = match.username.replace(/[^\p{L}\p{N}\s\-\.\[\]]/gu, '').trim() || match.username;
            resolvedNamesMap.set(match.username, safeName);
        }

        const statData = {
            game: 'Warzone',
            mode: match.mode || 'Unknown',
            kills: parseInt(match.kills) || 0,
            damage: parseInt(match.damage) || 0,
            // score: parseInt(match.score) || 0, // REMOVED (User Request)
            placement: parseInt(match.placement) || 0,
            evidence_batch: batchId,
            proofUrl: proofUrl,
            timestamp: new Date()
        };

        if (foundUser) {
            // ✅ EXACT/STRONG MATCH - Save to User DB

            // 🛑 DUPLICATE CHECK 2.0 (Query-Based)
            // Prevent saving if exact same Kilsl/Damage exists for this user in last 24h
            const duplicateCheckTime = new Date();
            duplicateCheckTime.setHours(duplicateCheckTime.getHours() - 24);

            const existingDupes = await db.collection('users').doc(foundUser.id).collection('games')
                .where('kills', '==', parseInt(match.kills) || 0)
                .where('damage', '==', parseInt(match.damage) || 0)
                .where('timestamp', '>=', duplicateCheckTime)
                .get();

            if (!existingDupes.empty) {
                log(`🛑 [COD Stats] Skipped Duplicate for ${foundUser.displayName} (${match.kills}K/${match.damage}D) - Already exists.`);
                ignoredCount++; // Track ignored
                continue; // Skip saving
            }

            const gameRef = db.collection('users').doc(foundUser.id).collection('games').doc();
            batchOps.set(gameRef, statData);
            savedCount++;
        } else {
            // ❓ UNKNOWN / AMBIGUOUS - Logic for Smart Suggestion
            // Now we check for partial matches ("includes") BUT only as a SUGGESTION
            const fuzzyCandidate = users.find(u => {
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

    log(`✅ [SmartLink] Processed ${args.matches.length} matches. Saved: ${savedCount}, Pending: ${pendingCount}.`);

    // 4. GENERATE GRAPHIC CARD 🎨 (Aggregated Summary)
    // 🛑 SILENCED: User requested NO IMMEDIATE REPORT (Night Spam Prevention).
    // The data is saved. The report will be generated daily at 12:00 PM via 'dailyRecap.js'.

    /* 
    const graphics = require('../../graphics/statsCard');
    const aggregatedMap = new Map();
    // ... (Logic preserved in comments or removed if clutter)
    // Removing generation logic to save resources too.
    */

    log(`✅ [COD Stats] Stats saved silently. Daily Report will cover this.`);

    // 5. Return Text Summary
    // 🤫 SILENCE: Don't send "Scan Report" text effectively. The Image/Reaction is enough.
    let response = ""; // Empty string = No text response from Brain (handled by reaction/image)

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
