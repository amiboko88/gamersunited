// 📁 handlers/matchmaker.js
const db = require('../utils/firebase');
const { log } = require('../utils/logger'); 

// רשימת המתנה כדי לא לחפור לך על אותו LID כל דקה
const pendingLids = new Set();
const ADMIN_PHONE = "972526800647"; // ✅ הטלפון שלך לקבלת דוחות

class Matchmaker {
    
    /**
     * מופעל כשמזוהה LID זר בקבוצה.
     * שולח דוח מודיעין לאדמין בפרטי.
     */
    async consultWithAdmin(sock, lid, pushName, messageContent) {
        // אם כבר שאלנו אותך על ה-LID הזה לאחרונה, לא נחפור שוב
        if (pendingLids.has(lid)) return;

        log(`🕵️ [Matchmaker] LID זר (${lid}). מדווח לאדמין.`);
        
        const report = `🕵️ *דוח מודיעין חדש*\n` +
                       `------------------\n` +
                       `גורם זר מדבר בקבוצה.\n\n` +
                       `👤 *כינוי:* ${pushName}\n` +
                       `💬 *תוכן:* "${messageContent.substring(0, 50)}..."\n` +
                       `🔑 *מזהה (LID):*\n\`${lid}\`\n\n` +
                       `כדי לאשר אותו:\n` +
                       `⬅️ **צטט (Reply)** הודעה זו\n` +
                       `📱 כתוב את המספר האמיתי שלו (למשל 050...)`;

        try {
            // שליחה אליך בפרטי
            await sock.sendMessage(ADMIN_PHONE + '@s.whatsapp.net', { text: report });
            
            // סימון שנשלח (כדי לא להציף אותך)
            pendingLids.add(lid);
            
            // ניקוי מהזיכרון אחרי שעה
            setTimeout(() => pendingLids.delete(lid), 1000 * 60 * 60);
        } catch (e) {
            console.error('Failed to send report to admin:', e);
        }
    }

    /**
     * מטפל בתשובה שלך (Reply) עם המספר
     * נקרא מתוך core.js
     */
    async handleAdminResponse(sock, msg, text) {
        // 1. האם זה ציטוט?
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        if (!quotedMsg || !quotedMsg.quotedMessage) return false;

        // 2. האם הציטוט מכיל LID? (אנחנו מחפשים את ה-LID בתוך הטקסט ששמעון שלח לך)
        const quotedText = quotedMsg.quotedMessage.conversation || quotedMsg.quotedMessage.extendedTextMessage?.text || "";
        
        // חילוץ ה-LID מבין הגרשיים בדוח (`12345`)
        const lidMatch = quotedText.match(/`(\d+)`/); 

        if (!lidMatch) return false; // לא ציטטת דוח מודיעין תקין

        const targetLid = lidMatch[1];
        const targetRealPhone = text.replace(/\D/g, ''); // המספר שכתבת

        if (targetRealPhone.length < 9) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ מספר לא תקין. נסה שוב.' }, { quoted: msg });
            return true;
        }

        // נרמול ל-972
        const formattedPhone = targetRealPhone.startsWith('05') ? '972' + targetRealPhone.substring(1) : targetRealPhone;

        log(`🔗 [Matchmaker] האדמין קישר: LID ${targetLid} -> PHONE ${formattedPhone}`);

        // 3. ביצוע הקישור ב-DB
        // נחפש את המשתמש לפי הטלפון שנתת (הוא אמור להיות קיים ב-DB כי יצרת אותו ידנית)
        let targetRef = null;
        
        // חיפוש לפי identity.whatsappPhone
        const userSnapshot = await db.collection('users').where('identity.whatsappPhone', 'in', [formattedPhone, targetRealPhone]).limit(1).get();
        if (!userSnapshot.empty) targetRef = userSnapshot.docs[0].ref;
        
        // חיפוש גיבוי לפי platforms.whatsapp
        if (!targetRef) {
            const platSnapshot = await db.collection('users').where('platforms.whatsapp', '==', formattedPhone).limit(1).get();
            if (!platSnapshot.empty) targetRef = platSnapshot.docs[0].ref;
        }

        if (targetRef) {
            // שמירת ה-LID בתיק האישי
            await targetRef.set({
                platforms: { whatsapp_lid: targetLid },
                meta: { lastLinked: new Date().toISOString() }
            }, { merge: true });

            await sock.sendMessage(msg.key.remoteJid, { text: `✅ **בוצע!**\nהסוכן ${formattedPhone} מקושר מעכשיו ל-LID הזה.\nהוא לא יופיע יותר בדוחות.` }, { quoted: msg });
            
            // מחיקה מהרשימה השחורה הזמנית
            pendingLids.delete(targetLid);

        } else {
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ לא מצאתי ב-DB משתמש עם הטלפון ${formattedPhone}.\nתוודא שהמספר תואם למה ששמרת ב-DB (למשל 972...).` }, { quoted: msg });
        }

        return true; // סמן שטופל
    }
    
    // פונקציות ישנות (משאירים ריק או לוגיקה מינימלית למקרה הצורך, כדי לא לשבור תלויות)
    async handleStranger(sock, jid, phone, name) { /* מבוטל - לא שולח כלום */ }
    async handleDiscordDM(msg) { /* מבוטל */ }
    async confirmNameMatch() { return false; }
}

module.exports = new Matchmaker();