const db = require('../../../utils/firebase');
const config = require('../config');
const { getUserRef } = require('../../../utils/userUtils');

const definition = {
    type: "function",
    function: {
        name: "link_game_alias",
        description: "ADMIN ONLY. Links a game username (from Warzone/COD) to a specific User. Also recovers past 'pending' stats for this alias.",
        parameters: {
            type: "object",
            properties: {
                target_user_phone: { type: "string", description: "The Phone Number (or Discord ID) of the real user." },
                alias: { type: "string", description: "The EXACT in-game username to link (e.g., 'Daddy CooL', 'Yogi')." }
            },
            required: ["target_user_phone", "alias"]
        }
    }
};

async function execute(args, userId, chatId) {
    // 1. Admin Check
    if (!config.ADMIN_PHONES.includes(userId) && userId !== '972526800647') {
        return "❌ Error: Only Admins can link aliases.";
    }

    const targetId = args.target_user_phone.replace(/\D/g, ''); // Clean phone
    const alias = args.alias.trim();

    try {
        // 2. Find User
        // We use getUserRef to resolve the Discord/Phone document
        // Note: We assume target_user_phone is a valid identifier
        const userRef = await getUserRef(targetId, 'whatsapp');
        const doc = await userRef.get();

        if (!doc.exists) {
            return `❌ User not found: ${targetId}. Please register them first.`;
        }

        const userData = doc.data();
        const currentAliases = userData.identity?.aliases || [];

        // Check duplicate
        if (currentAliases.map(a => a.toLowerCase()).includes(alias.toLowerCase())) {
            return `⚠️ Alias '${alias}' is already linked to ${userData.identity?.displayName}.`;
        }

        // 3. Link Alias
        await userRef.update({
            'identity.aliases': [...currentAliases, alias]
        });

        // 4. Retroactive Recovery (The Magic) 🪄
        const pendingSnap = await db.collection('pending_stats')
            .where('username', '==', alias)
            .get();

        let recoveredCount = 0;
        if (!pendingSnap.empty) {
            const batch = db.batch();

            pendingSnap.docs.forEach(pDoc => {
                const data = pDoc.data();
                // Move to User Games
                const newGameRef = userRef.collection('games').doc();
                batch.set(newGameRef, {
                    ...data,
                    recovered: true,
                    recoveredAt: new Date()
                });
                // Delete from Pending
                batch.delete(pDoc.ref);
                recoveredCount++;
            });

            await batch.commit();
        }

        return `✅ **Link Successful!**\n🔗 Linked alias "${alias}" to ${userData.identity?.displayName}.\n♻️ **Recovered ${recoveredCount} past games** from Pending.`;

    } catch (e) {
        return `❌ Error linking alias: ${e.message}`;
    }
}

module.exports = { definition, execute };
