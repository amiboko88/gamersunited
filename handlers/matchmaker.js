// 📁 handlers/matchmaker.js
const db = require('../utils/firebase');
const { log } = require('../utils/logger'); 

const pendingLids = new Set();
const ADMIN_PHONE = "972526800647"; 

// ניהול שיחות פתוחות עם המנהל
const adminSessions = new Map();

class Matchmaker {
    
    /**
     * דוח מודיעין לאדמין
     */
    async consultWithAdmin(sock, lid, pushName, messageContent) {
        if (pendingLids.has(lid)) return;

        log(`🕵️ [Matchmaker] זיהוי LID זר (${lid}). שולח דוח.`);
        
        const report = `🕵️ *דוח מודיעין חדש*\n` +
                       `------------------\n` +
                       `משתמש לא מזוהה בקבוצה.\n\n` +
                       `👤 *כינוי:* ${pushName}\n` +
                       `💬 *הודעה:* "${messageContent.substring(0, 30)}..."\n` +
                       `🔑 *מזהה (LID):*\n${lid}\n\n` + // הורדתי את הגרשיים כדי למנוע בעיות
                       `📋 *שלב 1: זיהוי דיסקורד*\n` +
                       `תעתיק את ה-Discord ID שלו, צטט הודעה זו, ושלח לי.`;

        try {
            await sock.sendMessage(ADMIN_PHONE + '@s.whatsapp.net', { text: report });
            pendingLids.add(lid);
            setTimeout(() => pendingLids.delete(lid), 1000 * 60 * 60);
        } catch (e) {
            console.error('Failed to report to admin:', e);
        }
    }

    /**
     * המוח שמנהל את הדו-שיח איתך
     */
    async handleAdminResponse(sock, msg, text) {
        const remoteJid = msg.key.remoteJid;
        const sender = remoteJid.split('@')[0]; 

        // 1. בדיקה: האם אנחנו כבר באמצע שיחה (מחכים לטלפון)?
        if (adminSessions.has(sender)) {
            return await this.handleStepTwoPhone(sock, msg, text, sender);
        }

        // 2. אם לא, זה כנראה שלב 1 (קבלת Discord ID)
        return await this.handleStepOneId(sock, msg, text, sender);
    }

    /**
     * שלב 1: קבלת Discord ID וחיבור ה-LID
     */
    async handleStepOneId(sock, msg, text, sender) {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        
        // לוג דיבוג לראות מה הבוט רואה
        // console.log("🔍 [Matchmaker Debug] הודעה נכנסת:", text);
        // console.log("🔍 [Matchmaker Debug] ציטוט:", quotedMsg?.quotedMessage?.conversation || "אין ציטוט");

        if (!quotedMsg || !quotedMsg.quotedMessage) return false;

        const quotedText = quotedMsg.quotedMessage.conversation || quotedMsg.quotedMessage.extendedTextMessage?.text || "";
        
        // תיקון קריטי: חיפוש גמיש יותר של ה-LID בתוך הטקסט המצוטט
        // מחפש את המילה LID ואחריה מספרים (מתעלם מתווים באמצע)
        const lidMatch = quotedText.match(/LID[\D]*(\d{10,20})/); 

        if (!lidMatch) {
            console.log("❌ [Matchmaker] לא הצלחתי לחלץ LID מהציטוט.");
            return false; 
        }

        const targetLid = lidMatch[1];
        
        // חילוץ Discord ID (מצפה ל-17 עד 20 ספרות)
        const discordIdMatch = text.match(/\d{17,20}/);
        
        if (!discordIdMatch) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ לא זיהיתי ID תקין של דיסקורד. נסה שוב.' }, { quoted: msg });
            return true;
        }

        const targetDiscordId = discordIdMatch[0];
        log(`🔗 [Matchmaker] מנסה לחבר: Discord ${targetDiscordId} <-> LID ${targetLid}`);

        try {
            const userRef = db.collection('users').doc(targetDiscordId);
            const doc = await userRef.get();

            if (!doc.exists) {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ המשתמש ${targetDiscordId} לא קיים ב-DB.\nתבדוק בדיסקורד שהעתקת נכון.` }, { quoted: msg });
                return true;
            }

            // חיבור ה-LID
            await userRef.set({
                platforms: { whatsapp_lid: targetLid },
                meta: { lastLinked: new Date().toISOString() }
            }, { merge: true });

            const userData = doc.data();
            const userName = userData.identity?.displayName || "המשתמש";

            // פתיחת סשן לשלב ב'
            adminSessions.set(sender, {
                stage: 'WAITING_PHONE',
                discordId: targetDiscordId,
                lid: targetLid,
                name: userName
            });

            await sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ מעולה! ה-LID חובר למשתמש **${userName}**.\n` +
                      `📱 *שלב 2: עדכון טלפון*\n` +
                      `תן לי את הנייד האמיתי שלו (למשל 054...) כדי לסגור את הפינה.` 
            }, { quoted: msg });
            
            pendingLids.delete(targetLid);

        } catch (error) {
            console.error(error);
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ שגיאה טכנית ב-DB.` }, { quoted: msg });
        }

        return true;
    }

    /**
     * שלב 2: קבלת טלפון
     */
    async handleStepTwoPhone(sock, msg, text, sender) {
        const session = adminSessions.get(sender);
        const rawPhone = text.replace(/\D/g, '');

        if (rawPhone.length < 9) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ מספר לא תקין. נסה שוב (או כתוב "ביטול").' }, { quoted: msg });
            return true;
        }

        if (text.includes('ביטול')) {
            adminSessions.delete(sender);
            await sock.sendMessage(msg.key.remoteJid, { text: '👍 בוטל.' }, { quoted: msg });
            return true;
        }

        const formattedPhone = rawPhone.startsWith('05') ? '972' + rawPhone.substring(1) : rawPhone;

        try {
            const userRef = db.collection('users').doc(session.discordId);
            
            await userRef.set({
                platforms: { whatsapp: formattedPhone },
                identity: { whatsappPhone: formattedPhone }
            }, { merge: true });

            await sock.sendMessage(msg.key.remoteJid, { 
                text: `🏁 **סיימנו!**\n` +
                      `המשתמש: **${session.name}** מחובר עכשיו מלא.\n` +
                      `גם LID וגם טלפון מסונכרנים.` 
            }, { quoted: msg });

            adminSessions.delete(sender);

        } catch (error) {
            console.error(error);
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ שגיאה בעדכון הטלפון.` }, { quoted: msg });
        }

        return true;
    }
}

module.exports = new Matchmaker();