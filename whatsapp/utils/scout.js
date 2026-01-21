// 📁 whatsapp/utils/scout.js
const { log } = require('../../utils/logger');
const userUtils = require('../../utils/userUtils'); // לשימוש ב-getUserRef בלבד אם צריך
const db = require('../../utils/firebase');

class WhatsAppScout {

    async syncGroupMembers(sock, mainGroupId) {
        if (!sock || !mainGroupId) return;

        log(`🕵️ [WhatsApp Scout] מתחיל סריקת חברים בקבוצה: ${mainGroupId}`);

        try {
            // ייבוא ה-Resolver (כדי להמיר LID לטלפון)
            const { getResolver } = require('../index');
            const resolveJid = getResolver();

            const metadata = await sock.groupMetadata(mainGroupId);
            const participants = metadata.participants;

            // לוג התחלתי
            // log(`🕵️ [WhatsApp Scout] סורק ${participants.length} חברים...`);

            // ✅ סנכרון לזיכרון (Store) כדי שהדיבוג לא יהיה ריק
            const store = require('../store');
            store.addContacts(participants);

            let recognizedUsers = 0;

            for (const p of participants) {
                // p.id is typically the Phone JID (e.g. 97250...@s.whatsapp.net)
                // p.lid is the LID JID (e.g. 12345...@lid) - THIS IS WHAT WE MISSING

                const phoneJid = p.id || '';
                const lidJid = p.lid || '';

                const realPhone = phoneJid.split('@')[0];
                const realLid = lidJid.split('@')[0];

                if (!realPhone) continue;

                // Case 1: We have a LID. Let's ensure it's saved.
                if (realLid) {
                    // Try to find user by Phone first (Most reliable link)
                    const userRef = await userUtils.getUserRef(realPhone, 'whatsapp');
                    const userDoc = await userRef.get();

                    if (userDoc.exists) {
                        const userData = userDoc.data();

                        // 🛡️ SAFE MODE: Only update if LID is COMPLETELY MISSING
                        // This prevents overwriting existing data that might be manually set
                        if (!userData.platforms?.whatsapp_lid) {
                            log(`🔗 [Scout] Patching MISSING LID for ${realPhone}: ${realLid}`);
                            await userRef.update({
                                'platforms.whatsapp_lid': realLid,
                                'identity.whatsapp_lid': realLid
                            });
                            recognizedUsers++;
                        } else {
                            // User already has a LID. We trust the DB.
                            // log(`✅ [Scout] Skipping ${realPhone} - LID exists.`);
                            recognizedUsers++;
                        }
                    } else {
                        // User not in DB at all? 
                        // Scout should NOT create users blindly (UserUtils guards this).
                        // But if we want to support "Auto Register" we can.
                        // For now, adhere to "Link Only" policy or "Orphan" policy?
                        // UserUtils.ensureUserExists will block creation if platform=whatsapp.
                        // So we do nothing.
                    }
                }

                // Case 2: No LID in metadata (Should not happen in modern WA)
                else {
                    // Just check existence
                    const userRef = await userUtils.getUserRef(realPhone, 'whatsapp');
                    const userDoc = await userRef.get();
                    if (userDoc.exists) recognizedUsers++;
                }
            }

            log(`✅ [WhatsApp Scout] סריקה הסתיימה. ${recognizedUsers}/${participants.length} משתמשים מזוהים ומקושרים.`);

        } catch (error) {
            log(`❌ [WhatsApp Scout] שגיאה בסריקה: ${error.message}`);
        }
    }
}

module.exports = new WhatsAppScout();