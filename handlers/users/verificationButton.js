// 📁 handlers/users/verificationButton.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const db = require('../../utils/firebase');
const path = require('path');
const { log } = require('../../utils/logger');

// הגדרות
const VERIFICATION_CHANNEL_ID = '1120791404583587971'; // ערוץ האימות
const METADATA_DOC_REF = db.collection('system_metadata').doc('verification_message');
const ASSETS_PATH = path.join(__dirname, '../../assets/verify.png'); // וודא שהתמונה קיימת שם

/**
 * מציב את הודעת האימות (תמונה בלבד) בערוץ
 * נקרא מ-botLifecycle ב-Startup
 */
async function setupVerificationMessage(client) {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;

        const channel = guild.channels.cache.get(VERIFICATION_CHANNEL_ID);
        if (!channel?.isTextBased()) {
            log(`⚠️ [Verification] ערוץ אימות לא נמצא: ${VERIFICATION_CHANNEL_ID}`);
            return;
        }

        // בדיקה מול ה-DB אם ההודעה קיימת
        const metaDoc = await METADATA_DOC_REF.get();
        const existingId = metaDoc.exists ? metaDoc.data().messageId : null;
        
        let messageExists = false;
        if (existingId) {
            try {
                await channel.messages.fetch(existingId);
                messageExists = true;
            } catch (e) {
                messageExists = false;
            }
        }

        // אם ההודעה קיימת ותקינה - לא עושים כלום
        if (messageExists) {
            // log('✅ [Verification] הודעת אימות קיימת ותקינה.');
            return;
        }

        // --- 🧹 ניקוי הערוץ (הבקשה שלך) ---
        // אם ההודעה לא קיימת ב-DB או נמחקה, מנקים את הערוץ כדי למנוע כפילויות
        log('[Verification] 🧹 מנקה את ערוץ האימות ושולח הודעה חדשה...');
        try {
            await channel.bulkDelete(20).catch(() => {}); // מוחק את ה-20 האחרונות
        } catch (e) {
            console.warn('Could not bulk delete in verification channel:', e.message);
        }

        // --- 📤 שליחת ההודעה החדשה (רק תמונה וכפתור) ---
        const attachment = new AttachmentBuilder(ASSETS_PATH, { name: 'verify.png' });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('verify_me_button')
                .setLabel('לחץ כאן לאימות') // טקסט על הכפתור חובה בדיסקורד
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅')
        );

        const sentMessage = await channel.send({
            files: [attachment], // רק תמונה
            components: [row]
        });

        // עדכון ה-DB עם ה-ID החדש
        await METADATA_DOC_REF.set({ messageId: sentMessage.id });
        log('[Verification] ✅ הודעת אימות חדשה נשלחה בהצלחה.');

    } catch (error) {
        log(`❌ [Verification] שגיאה בהגדרת כפתור אימות: ${error.message}`);
    }
}

module.exports = { setupVerificationMessage };