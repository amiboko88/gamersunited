// 📁 handlers/matchmaker.js
const db = require('../utils/firebase');
const { log } = require('../utils/logger'); 

// מאגר זמני של משתמשים לא מזוהים (LID -> פרטים)
// המפתח הוא ה-LID
const orphanLids = new Map(); 

class Matchmaker {
    
    /**
     * במקום לשלוח הודעה, רק שומרים ברשימה ומחכים לפקודה בדיסקורד
     */
    async registerOrphan(lid, pushName, messageContent) {
        // אם כבר שמרנו אותו, נעדכן רק את הזמן וההודעה האחרונה
        const existing = orphanLids.get(lid);
        
        const orphanData = {
            lid: lid,
            name: pushName || (existing ? existing.name : "Unknown"),
            lastMsg: messageContent ? messageContent.substring(0, 30) : (existing ? existing.lastMsg : "..."),
            timestamp: Date.now()
        };

        orphanLids.set(lid, orphanData);
        
        // לוג רק בפעם הראשונה בדקה האחרונה (כדי לא להספים את הקונסולה)
        if (!existing || Date.now() - existing.timestamp > 60000) {
            log(`🕵️ [Matchmaker] LID זר (${lid}) נשמר במאגר להמתנה.`);
        }
    }

    /**
     * מחזיר את הרשימה (עבור הפקודה בדיסקורד)
     */
    getOrphans() {
        return Array.from(orphanLids.values());
    }

    /**
     * ביצוע הקישור הסופי (נקרא מהפקודה בדיסקורד)
     */
    async linkUser(discordId, lid) {
        try {
            const userRef = db.collection('users').doc(discordId);
            const doc = await userRef.get();

            if (!doc.exists) return { success: false, error: "User not found" };

            // ביצוע הקישור ב-DB
            await userRef.set({
                platforms: { 
                    whatsapp_lid: lid,
                    whatsapp: lid // שומרים גם כאן לגיבוי
                },
                meta: { lastLinked: new Date().toISOString() }
            }, { merge: true });

            // הסרה מהרשימה
            orphanLids.delete(lid);
            log(`🔗 [Matchmaker] קישור בוצע דרך דיסקורד: ${discordId} <-> ${lid}`);
            
            return { success: true };
        } catch (error) {
            console.error(error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new Matchmaker();