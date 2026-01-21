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
            let skippedLog = [];

            if (participants.length > 0) {
                console.log('🔍 [Debug] Raw Participant Sample:', JSON.stringify(participants[0], null, 2));
            }

            for (const p of participants) {
                // p.id is typically the Phone JID (e.g. 97250...@s.whatsapp.net)
                // p.lid is the LID JID (e.g. 12345...@lid) - THIS IS WHAT WE MISSING

                let phoneJid = p.id || '';
                let lidJid = p.lid || '';

                // 🐛 FIX: Baileys sometimes puts the LID in 'id' and the Phone in 'phoneNumber'
                if (phoneJid.includes('@lid')) {
                    lidJid = phoneJid;
                    phoneJid = p.phoneNumber || '';
                    // If phoneNumber is missing, we might have a problem, but usually it's there
                }

                const realPhone = phoneJid ? phoneJid.split('@')[0] : '';
                const realLid = lidJid ? lidJid.split('@')[0] : '';

                // 🛑 EXCLUDE SHIMON (BOT) FROM SYNC
                if (realPhone === '972549220819') continue;

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
                        // User not found in DB
                        skippedLog.push({ phone: realPhone, reason: 'Not in DB' });
                    }
                }

                // Case 2: No LID in metadata (Should not happen in modern WA)
                else {
                    skippedLog.push({ phone: realPhone, reason: 'No LID in Metadata' });
                }
            }

            log(`✅ [WhatsApp Scout] סריקה הסתיימה. ${recognizedUsers}/${participants.length} משתמשים מזוהים ומקושרים.`);
            if (skippedLog.length > 0) {
                log(`⚠️ [WhatsApp Scout] Skipped ${skippedLog.length} users:`);
                skippedLog.forEach(s => log(`- Phone: ${s.phone} | Reason: ${s.reason}`));
            }

        } catch (error) {
            log(`❌ [WhatsApp Scout] שגיאה בסריקה: ${error.message}`);
        }
    }
}

module.exports = new WhatsAppScout();