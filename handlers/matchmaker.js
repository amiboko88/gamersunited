// 📁 handlers/matchmaker.js
const db = require('../utils/firebase');
const { log } = require('../utils/logger'); 

const pendingLids = new Set();
const ADMIN_PHONE = "972526800647"; 

// ניהול שיחות פתוחות עם המנהל
// המבנה: Map<AdminPhone, { stage: 'WAITING_PHONE', discordId: '...', lid: '...' }>
const adminSessions = new Map();

class Matchmaker {
    
    /**
     * דוח מודיעין לאדמין (מתחיל את התהליך)
     */
    async consultWithAdmin(sock, lid, pushName, messageContent) {
        if (pendingLids.has(lid)) return;

        log(`🕵️ [Matchmaker] זיהוי LID זר (${lid}). שולח דוח.`);
        
        const report = `🕵️ *דוח מודיעין חדש*\n` +
                       `------------------\n` +
                       `משתמש לא מזוהה בקבוצה.\n\n` +
                       `👤 *כינוי:* ${pushName}\n` +
                       `💬 *הודעה:* "${messageContent.substring(0, 30)}..."\n` +
                       `🔑 *מזהה (LID):*\n\`${lid}\`\n\n` +
                       `📋 *שלב 1: זיהוי דיסקורד*\n` +
                       `תעתיק את ה-Discord ID שלו, צטט הודעה זו, ושלח לי.`;

        try {
            await sock.sendMessage(ADMIN_PHONE + '@s.whatsapp.net', { text: report });
            pendingLids.add(lid);
            // מנקים כדי לא לחפור, אבל משאירים זמן לתגובה
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
        const sender = remoteJid.split('@')[0]; // המספר שלך

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
        // בדיקת ציטוט (חובה כדי לדעת על איזה LID מדובר)
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo;
        if (!quotedMsg || !quotedMsg.quotedMessage) return false;

        const quotedText = quotedMsg.quotedMessage.conversation || quotedMsg.quotedMessage.extendedTextMessage?.text || "";
        const lidMatch = quotedText.match(/`(\d+)`/); 

        if (!lidMatch) return false; // לא ציטטת דוח תקין

        const targetLid = lidMatch[1];
        
        // חילוץ Discord ID מתוך הטקסט שלך (עמיד בפני טקסטים נוספים)
        const discordIdMatch = text.match(/\d{17,20}/);
        
        if (!discordIdMatch) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ לא מצאתי מזהה דיסקורד תקין (17-20 ספרות). נסה שוב.' }, { quoted: msg });
            return true; // עצרנו את הבוט מלהגיב ב-AI, מחכים לתיקון שלך
        }

        const targetDiscordId = discordIdMatch[0];

        try {
            const userRef = db.collection('users').doc(targetDiscordId);
            const doc = await userRef.get();

            if (!doc.exists) {
                await sock.sendMessage(msg.key.remoteJid, { text: `❌ המשתמש ${targetDiscordId} לא קיים ב-DB.\nתבדוק בדיסקורד שהעתקת נכון.` }, { quoted: msg });
                return true;
            }

            // ✅ חיבור ה-LID (החלק הקריטי לזיהוי בוואטסאפ)
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

            // בקשת הטלפון
            await sock.sendMessage(msg.key.remoteJid, { 
                text: `✅ יופי! ה-LID חובר למשתמש **${userName}**.\n` +
                      `📱 *שלב 2: עדכון טלפון*\n` +
                      `כדי שהכל יהיה מושלם, כתוב לי עכשיו את המספר הנייד האמיתי שלו (למשל 054...).` 
            }, { quoted: msg });
            
            // מחיקה מהרשימה השחורה כדי שלא ידווח שוב
            pendingLids.delete(targetLid);

        } catch (error) {
            console.error(error);
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ שגיאה טכנית ב-DB.` }, { quoted: msg });
        }

        return true;
    }

    /**
     * שלב 2: קבלת טלפון וסגירת מעגל
     */
    async handleStepTwoPhone(sock, msg, text, sender) {
        const session = adminSessions.get(sender);
        
        // חילוץ מספר טלפון נקי
        const rawPhone = text.replace(/\D/g, '');

        // בדיקת תקינות מינימלית
        if (rawPhone.length < 9) {
            await sock.sendMessage(msg.key.remoteJid, { text: '❌ זה לא נראה כמו מספר טלפון. נסה שוב (או כתוב "ביטול").' }, { quoted: msg });
            return true;
        }

        // ביטול יזום
        if (text.includes('ביטול') || text.includes('עזוב')) {
            adminSessions.delete(sender);
            await sock.sendMessage(msg.key.remoteJid, { text: '👍 סבבה, עצרנו כאן. (ה-LID כבר מקושר, רק הטלפון לא עודכן).' }, { quoted: msg });
            return true;
        }

        // נרמול ל-972
        const formattedPhone = rawPhone.startsWith('05') ? '972' + rawPhone.substring(1) : rawPhone;

        try {
            const userRef = db.collection('users').doc(session.discordId);
            
            // עדכון סופי של הטלפון
            await userRef.set({
                platforms: { whatsapp: formattedPhone },
                identity: { whatsappPhone: formattedPhone }
            }, { merge: true });

            await sock.sendMessage(msg.key.remoteJid, { 
                text: `🏁 **התהליך הושלם!**\n` +
                      `המשתמש: **${session.name}**\n` +
                      `Discord ID: ${session.discordId}\n` +
                      `LID: המזהה הארוך (מקושר)\n` +
                      `Phone: ${formattedPhone} (מקושר)\n\n` +
                      `שמעון מכיר אותו עכשיו פיקס.` 
            }, { quoted: msg });

            // סגירת הסשן
            adminSessions.delete(sender);

        } catch (error) {
            console.error(error);
            await sock.sendMessage(msg.key.remoteJid, { text: `❌ שגיאה בעדכון הטלפון.` }, { quoted: msg });
        }

        return true;
    }
}

module.exports = new Matchmaker();