// 📁 handlers/matchmaker.js
const db = require('../utils/firebase');
const { log } = require('../utils/logger');

class Matchmaker {
    
    /**
     * מטפל במשתמש וואטסאפ לא מזוהה (Stranger).
     * 1. מנסה למצוא התאמה לפי שם (Smart Match).
     * 2. אם לא מצא - שולח הודעת "לך לדיסקורד".
     */
    async handleStranger(sock, phone, pushName) {
        if (!phone) return;
        const cleanPhone = phone.replace(/\D/g, ''); // ניקוי לוודאות

        log(`🕵️ [Matchmaker] בודק משתמש חדש: ${pushName} (${cleanPhone})`);

        // 1. נסיון הצלבה חכם לפי שם (Name Matching)
        // מחפש ב-DB האם יש משתמש דיסקורד עם אותו שם בדיוק (Case Sensitive ליתר ביטחון)
        if (pushName && pushName !== "Unknown") {
            try {
                const nameSnapshot = await db.collection('users')
                    .where('identity.displayName', '==', pushName)
                    .limit(1)
                    .get();

                if (!nameSnapshot.empty) {
                    const userDoc = nameSnapshot.docs[0];
                    log(`🕵️ [Matchmaker] התאמת שם פוטנציאלית: ${pushName} -> Discord ID: ${userDoc.id}`);
                    
                    const msg = `אהלן ${pushName}, שמעון כאן.\n` +
                                `אני רואה שאתה חדש בוואטסאפ, אבל יש לי משתמש בדיסקורד בשם הזה.\n` +
                                `אם זה אתה, פשוט תגיב כאן: **"אני ${pushName}"** ואני אחבר ביניכם.`;
                    
                    await sock.sendMessage(cleanPhone + '@s.whatsapp.net', { text: msg });
                    return;
                }
            } catch (e) {
                log(`❌ [Matchmaker] שגיאה בחיפוש שם: ${e.message}`);
            }
        }

        // 2. אם אין התאמת שם - שולחים להזדהות בדיסקורד
        log(`🛡️ [Matchmaker] משתמש לא מזוהה (${pushName}). שולח הנחיות לחיבור.`);
        
        const inviteMsg = `שלום צדיק 👋\n` +
                          `אני לא מזהה את המספר הזה במערכת (${cleanPhone}).\n` +
                          `כדי לחבר את הניקוד והסטטיסטיקה שלך, כנס לדיסקורד ושלח לי **בהודעה פרטית** את המספר הזה:\n` +
                          `*${cleanPhone}*\n\n` +
                          `מחכה לך שם.`;

        await sock.sendMessage(cleanPhone + '@s.whatsapp.net', { text: inviteMsg });
    }

    /**
     * מטפל בהודעה פרטית בדיסקורד - מנסה לחלץ מספר טלפון ולבצע קישור.
     */
    async handleDiscordDM(message) {
        // התעלמות מבוטים
        if (message.author.bot) return;

        // ניקוי הטקסט כדי למצוא רק מספרים
        const text = message.content;
        const extractedNumbers = text.replace(/\D/g, '');

        // בדיקה בסיסית: האם זה נראה כמו מספר טלפון ישראלי? (9-13 ספרות)
        if (extractedNumbers.length < 9 || extractedNumbers.length > 13) {
            return; // מתעלמים, אולי סתם שיחה
        }

        // נרמול למבנה בינלאומי (972...)
        let finalPhone = extractedNumbers;
        if (finalPhone.startsWith('05')) {
            finalPhone = '972' + finalPhone.substring(1);
        }

        log(`🔗 [Matchmaker] בקשת קישור מדיסקורד: ${message.author.tag} -> ${finalPhone}`);

        // בדיקה: האם המספר הזה כבר תפוס?
        const existingUser = await db.collection('users').where('platforms.whatsapp', '==', finalPhone).get();
        if (!existingUser.empty) {
            // אם זה המשתמש עצמו, זה בסדר (סתם שלח שוב)
            if (existingUser.docs[0].id === message.author.id) {
                message.reply(`✅ המספר הזה כבר מקושר לחשבון שלך, הכל טוב.`);
                return;
            }
            message.reply(`❌ המספר הזה כבר מקושר למשתמש אחר במערכת.`);
            return;
        }

        // ביצוע הקישור!
        try {
            const userRef = db.collection('users').doc(message.author.id);
            
            // אנחנו שומרים גם ב-platforms (לזיהוי טכני) וגם ב-identity (להצגה)
            await userRef.set({
                platforms: { whatsapp: finalPhone },
                identity: { whatsappPhone: finalPhone },
                meta: { lastActive: new Date().toISOString() }
            }, { merge: true });

            message.reply(`✅ **בוצע!**\nהמספר *${finalPhone}* קושר בהצלחה לחשבון הדיסקורד שלך.\nמעכשיו שמעון יזהה אותך בוואטסאפ.`);
            log(`✅ [Matchmaker] שידוך מוצלח: ${message.author.tag} <-> ${finalPhone}`);

        } catch (error) {
            log(`❌ [Matchmaker] שגיאה בקישור: ${error.message}`);
            message.reply(`קרתה תקלה טכנית בקישור. תגיד לעמי לבדוק לוגים.`);
        }
    }

    /**
     * אישור ידני מוואטסאפ ("אני משה") - נקרא מתוך ה-Index
     */
    async confirmNameMatch(sock, phone, text, pushName) {
        if (!text || !pushName) return false;
        
        // בדיקה גמישה: "אני משה", "זה אני משה", "אני משה כהן"
        if (text.toLowerCase().includes(`אני ${pushName.toLowerCase()}`)) {
             const nameSnapshot = await db.collection('users')
                .where('identity.displayName', '==', pushName)
                .limit(1)
                .get();

            if (!nameSnapshot.empty) {
                const userRef = nameSnapshot.docs[0].ref;
                const cleanPhone = phone.replace(/\D/g, '');
                
                await userRef.set({
                    platforms: { whatsapp: cleanPhone },
                    identity: { whatsappPhone: cleanPhone },
                    meta: { lastActive: new Date().toISOString() }
                }, { merge: true });

                await sock.sendMessage(cleanPhone + '@s.whatsapp.net', { text: `✅ אש עליך! חיברתי אותך. דבר איתי.` });
                log(`✅ [Matchmaker] משתמש אישר זהות בוואטסאפ: ${pushName} -> ${cleanPhone}`);
                return true;
            }
        }
        return false;
    }
}

module.exports = new Matchmaker();