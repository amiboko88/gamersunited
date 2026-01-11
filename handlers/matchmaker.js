// 📁 handlers/matchmaker.js
const db = require('../utils/firebase');
const { log, sendStaffLog } = require('../utils/logger'); 

class Matchmaker {
    
    async handleStranger(sock, phone, pushName) {
        if (!phone) return;
        const cleanPhone = phone.replace(/\D/g, ''); 

        log(`🕵️ [Matchmaker] בודק משתמש חדש: ${pushName} (${cleanPhone})`);

        // 1. נסיון הצלבה חכם לפי שם
        if (pushName && pushName !== "Unknown") {
            try {
                const nameSnapshot = await db.collection('users')
                    .where('identity.displayName', '==', pushName)
                    .limit(1)
                    .get();

                if (!nameSnapshot.empty) {
                    const userDoc = nameSnapshot.docs[0];
                    log(`✨ [Matchmaker] נמצאה התאמה לשם! שולח הודעה ל-${pushName}`);
                    
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

        // 2. אין התאמה - שולחים להזדהות בדיסקורד
        log(`🛡️ [Matchmaker] אין התאמה אוטומטית. שולח בקשת הזדהות.`);
        
        const inviteMsg = `שלום צדיק 👋\n` +
                          `אני לא מזהה את המספר הזה במערכת (${cleanPhone}).\n` +
                          `כדי לחבר את הניקוד שלך, כנס לדיסקורד ושלח לי **בהודעה פרטית** את המספר הזה:\n` +
                          `*${cleanPhone}*\n\n` +
                          `מחכה לך שם.`;

        await sock.sendMessage(cleanPhone + '@s.whatsapp.net', { text: inviteMsg });
    }

    async handleDiscordDM(message) {
        if (message.author.bot) return;

        const text = message.content;
        const extractedNumbers = text.replace(/\D/g, '');

        if (extractedNumbers.length < 9 || extractedNumbers.length > 13) return;

        let finalPhone = extractedNumbers;
        if (finalPhone.startsWith('05')) {
            finalPhone = '972' + finalPhone.substring(1);
        }

        log(`🔗 [Matchmaker] בקשת קישור מדיסקורד: ${message.author.tag} -> ${finalPhone}`);

        // בדיקה: האם המספר הזה כבר תפוס?
        const existingUser = await db.collection('users').where('platforms.whatsapp', '==', finalPhone).get();
        if (!existingUser.empty) {
            if (existingUser.docs[0].id === message.author.id) {
                message.reply(`✅ אחינו, כבר חיברתי אותך. הכל טוב.`);
            } else {
                message.reply(`❌ המספר הזה שייך למישהו אחר במערכת.`);
            }
            return;
        }

        try {
            const userRef = db.collection('users').doc(message.author.id);
            await userRef.set({
                platforms: { whatsapp: finalPhone },
                identity: { whatsappPhone: finalPhone },
                meta: { lastActive: new Date().toISOString() }
            }, { merge: true });

            message.reply(`✅ **בוצע!**\nהמספר *${finalPhone}* קושר בהצלחה.\nמעכשיו אנחנו מדברים בוואטסאפ.`);
            log(`✅ [Matchmaker] שידוך מוצלח: ${message.author.tag} <-> ${finalPhone}`);

        } catch (error) {
            message.reply(`תקלה טכנית. תגיד לעמי.`);
        }
    }

    async confirmNameMatch(sock, phone, text, pushName) {
        if (!text || !pushName) return false;
        
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

                await sock.sendMessage(cleanPhone + '@s.whatsapp.net', { text: `✅ אש עליך! חיברתי אותך.` });
                log(`✅ [Matchmaker] משתמש אישר זהות בוואטסאפ: ${pushName}`);
                return true;
            }
        }
        return false;
    }
}

module.exports = new Matchmaker();