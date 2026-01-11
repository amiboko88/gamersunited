// 📁 handlers/matchmaker.js
const db = require('../utils/firebase');
const { log } = require('../utils/logger'); 

class Matchmaker {
    
    /**
     * מטפל במשתמש זר.
     * מקבל את ה-JID המקורי (כולל ה-Domain) כדי להבטיח שההודעה תגיע.
     */
    async handleStranger(sock, originalJid, phoneOrLid, pushName) {
        if (!originalJid) return;
        
        // לוגיקה לזיהוי מספר נקי לתצוגה
        const displayId = phoneOrLid || originalJid.split('@')[0];

        log(`🕵️ [Matchmaker] בודק משתמש חדש: ${pushName} (${displayId})`);

        // 1. נסיון הצלבה חכם לפי שם (Smart Name Match)
        if (pushName && pushName !== "Unknown") {
            try {
                // בדיקה מדויקת
                let nameSnapshot = await db.collection('users')
                    .where('identity.displayName', '==', pushName).limit(1).get();

                // אם לא מצאנו, ננסה חיפוש "מכיל" (רק אם השם ארוך מספיק)
                // זה פתרון לבעיית "Amos Ami Bokobza" vs "Ami"
                if (nameSnapshot.empty) {
                     // שליפת כל המשתמשים (זהירות, רק אם ה-DB קטן יחסית. אם ענק, ותרו על זה)
                     // כאן נניח שלא, ונשאיר את זה מדויק למניעת טעויות, 
                     // אבל נשלח לוג שאפשר לקשר ידנית.
                }

                if (!nameSnapshot.empty) {
                    const userDoc = nameSnapshot.docs[0];
                    log(`✨ [Matchmaker] נמצאה התאמה לשם! שולח הודעה ל-${pushName}`);
                    
                    const msg = `אהלן ${pushName}, שמעון כאן.\n` +
                                `אני רואה שאתה חדש בוואטסאפ, אבל יש לי משתמש בדיסקורד בשם הזה.\n` +
                                `אם זה אתה, פשוט תגיב כאן: **"אני ${pushName}"** ואני אחבר ביניכם.`;
                    
                    // ✅ שליחה לכתובת המקורית הבטוחה
                    await sock.sendMessage(originalJid, { text: msg });
                    return;
                }
            } catch (e) {
                log(`❌ [Matchmaker] שגיאה בחיפוש שם: ${e.message}`);
            }
        }

        // 2. אין התאמה - שולחים להזדהות בדיסקורד
        log(`🛡️ [Matchmaker] אין התאמה אוטומטית. שולח בקשת הזדהות ל-${originalJid}`);
        
        const inviteMsg = `שלום צדיק 👋\n` +
                          `אני לא מזהה את המספר שלך במערכת (${displayId}).\n\n` +
                          `כדי לחבר את הניקוד שלך:\n` +
                          `1. כנס לדיסקורד.\n` +
                          `2. שלח לי **בהודעה פרטית** את הקוד הבא:\n` +
                          `\`${displayId}\`\n\n` + // שולחים לו את ה-LID כדי שישלח לנו חזרה!
                          `מחכה לך שם.`;

        // ✅ שליחה לכתובת המקורית הבטוחה
        await sock.sendMessage(originalJid, { text: inviteMsg });
    }

    // --- הטיפול בדיסקורד (נשאר זהה, אבל עם תיקון לוגי קטן) ---
    async handleDiscordDM(message) {
        if (message.author.bot) return;

        const text = message.content.trim();
        // אנחנו מצפים שהמשתמש ישלח את המספר/LID שהופיע לו בהודעה בוואטסאפ
        // לכן אנחנו לא מנקים באגרסיביות את ה-972 אם זה LID
        const inputId = text.replace(/\D/g, '');

        if (inputId.length < 5) return; // הגנה מינימלית

        log(`🔗 [Matchmaker] בקשת קישור מדיסקורד: ${message.author.tag} -> ${inputId}`);

        // בדיקה אם המספר הזה כבר תפוס
        // שים לב: אנחנו מחפשים גם ב-whatsapp וגם ב-whatsapp_lid
        let existingUser = await db.collection('users').where('platforms.whatsapp', '==', inputId).get();
        if (existingUser.empty) {
             existingUser = await db.collection('users').where('platforms.whatsapp_lid', '==', inputId).get();
        }

        if (!existingUser.empty) {
            if (existingUser.docs[0].id === message.author.id) {
                message.reply(`✅ כבר מחובר אלינו נשמה, הכל טוב.`);
            } else {
                message.reply(`❌ המזהה הזה (${inputId}) כבר מקושר למשתמש אחר.`);
            }
            return;
        }

        try {
            const userRef = db.collection('users').doc(message.author.id);
            
            // אנחנו שומרים את מה שהמשתמש שלח. אם זה LID - נשמור ב-LID. אם טלפון - בטלפון.
            const updates = { meta: { lastActive: new Date().toISOString() } };
            
            if (inputId.length > 14) {
                updates['platforms.whatsapp_lid'] = inputId;
                // אופציונלי: לשים גם ב-whatsapp הרגיל כדי שהמערכת תעבוד חלק, 
                // אבל עדיף להפריד אם רוצים סדר. כרגע נשים בשניהם ליתר ביטחון תפעולי:
                updates['platforms.whatsapp'] = inputId; 
            } else {
                updates['platforms.whatsapp'] = inputId;
                updates['identity.whatsappPhone'] = inputId;
            }

            await userRef.set(updates, { merge: true });

            message.reply(`✅ **בוצע!**\nחיברתי את החשבון שלך למזהה: \`${inputId}\`.\nעכשיו תנסה לכתוב שוב בוואטסאפ.`);
            log(`✅ [Matchmaker] שידוך מוצלח: ${message.author.tag} <-> ${inputId}`);

        } catch (error) {
            console.error(error);
            message.reply(`תקלה טכנית בקישור.`);
        }
    }

    // --- אישור שם ("אני משה") ---
    async confirmNameMatch(sock, originalJid, phoneOrLid, text, pushName) {
        if (!text || !pushName) return false;
        
        if (text.toLowerCase().includes(`אני ${pushName.toLowerCase()}`)) {
             const nameSnapshot = await db.collection('users')
                .where('identity.displayName', '==', pushName).limit(1).get();

            if (!nameSnapshot.empty) {
                const userRef = nameSnapshot.docs[0].ref;
                
                // עדכון ב-DB
                const updates = { 
                    'platforms.whatsapp': phoneOrLid, // שומרים את ה-LID/Phone שזיהינו
                    'meta.lastActive': new Date().toISOString()
                };
                if (phoneOrLid.length > 14) updates['platforms.whatsapp_lid'] = phoneOrLid;

                await userRef.set(updates, { merge: true });

                // ✅ שליחה לכתובת המקורית
                await sock.sendMessage(originalJid, { text: `✅ אש עליך! חיברתי אותך.` });
                log(`✅ [Matchmaker] משתמש אישר זהות בוואטסאפ: ${pushName}`);
                return true;
            }
        }
        return false;
    }
}

module.exports = new Matchmaker();