// 📁 handlers/birthday/manager.js
const cron = require('node-cron');
const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const { getUserRef } = require('../../utils/userUtils');
// const visual = require('./visual'); // ❌ נמחק
const graphics = require('../graphics/index'); // ✅ המערכת הגרפית החדשה
const broadcaster = require('./broadcaster');

const GIFT_AMOUNT = 500;
// ✅ הפניה לקובץ הטיימרים החדש (מונע כפילויות בריסטרט)
const TIMERS_REF = db.collection('system_metadata').doc('timers');

class BirthdayManager {
    constructor() {
        this.clients = {}; 
    }

    /**
     * אתחול המערכת (נקרא מ-botLifecycle)
     */
    init(discordClient, waSock, waGroupId, telegramBot) {
        this.clients = { discord: discordClient, whatsapp: waSock, waGroupId, telegram: telegramBot };
        
        // 1. חגיגה יומית ב-08:00
        cron.schedule('0 8 * * *', () => this.runDailyCheck(), { timezone: "Asia/Jerusalem" });
        
        // 2. תזכורת חודשית ב-1 לחודש ב-12:00
        cron.schedule('0 12 1 * *', () => this.runMonthlyReminder(), { timezone: "Asia/Jerusalem" });

        log('[BirthdayManager] ✅ מודול ימי הולדת נטען (Daily & Monthly).');
    }

    /**
     * הרשמה (משמש גם את הסלאש בדיסקורד וגם את זיהוי הטקסט בוואטסאפ)
     */
    async registerUser(userId, platform, day, month, year) {
        const userRef = await getUserRef(userId, platform);
        const currentYear = new Date().getFullYear();
        
        // תיקון שנה מקוצרת (95 -> 1995)
        if (year < 100) year += (year > 50 ? 1900 : 2000); 
        
        const age = currentYear - year;
        if (age < 5 || age > 100) throw new Error('גיל לא הגיוני');

        await userRef.set({
            identity: {
                birthday: { day, month, year, age }
            },
            tracking: {
                birthdayUpdated: new Date().toISOString()
            }
        }, { merge: true });
        
        return { age, day, month };
    }

    /**
     * הריצה היומית (08:00)
     * ✅ משודרג: בודק ב-system_metadata לפני הרצה
     */
    async runDailyCheck() {
        const now = new Date();
        const todayDay = now.getDate();
        const todayMonth = now.getMonth() + 1;

        log(`[BirthdayManager] 🎂 מתחיל בדיקת ימי הולדת ל-${todayDay}/${todayMonth}...`);

        try {
            // --- 🛡️ בדיקת בטיחות (הקוד החדש) ---
            // בודקים אם כבר רץ היום כדי למנוע כפילויות במקרה של ריסטרט
            const timerDoc = await TIMERS_REF.get();
            if (timerDoc.exists) {
                const lastCheck = timerDoc.data().lastBirthdayCheck;
                if (lastCheck) {
                    const lastDate = new Date(lastCheck);
                    // אם התאריך שנשמר הוא היום - עוצרים
                    if (lastDate.getDate() === todayDay && lastDate.getMonth() + 1 === todayMonth && lastDate.getFullYear() === now.getFullYear()) {
                        log('[BirthdayManager] ⏳ הבדיקה כבר בוצעה היום. מדלג.');
                        return;
                    }
                }
            }
            // ------------------------------------

            const snapshot = await db.collection('users')
                .where('identity.birthday.day', '==', todayDay)
                .where('identity.birthday.month', '==', todayMonth)
                .get();

            if (snapshot.empty) {
                log('[BirthdayManager] 📅 אין ימי הולדת היום.');
            } else {
                log(`[BirthdayManager] 🎉 נמצאו ${snapshot.size} חוגגים!`);
                for (const doc of snapshot.docs) {
                    await this.celebrate(doc.id, doc.data());
                }
            }

            // ✅ עדכון הטיימר ב-DB שסיימנו להיום
            await TIMERS_REF.set({ lastBirthdayCheck: now.toISOString() }, { merge: true });

        } catch (error) {
            log(`❌ [BirthdayManager] שגיאה יומית: ${error.message}`);
        }
    }

    /**
     * הריצה החודשית - "רשימת הבושה" (01 לחודש)
     */
    async runMonthlyReminder() {
        if (!this.clients.whatsapp || !this.clients.waGroupId) return;
        
        log('[BirthdayManager] 📢 מכין דוח חוסרים חודשי...');
        const snapshot = await db.collection('users').get();
        const missingUsers = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            // מי שמחובר לוואטסאפ אבל אין לו יום הולדת
            if (!data.identity?.birthday?.day && data.platforms?.whatsapp) {
                const phone = data.platforms.whatsapp.replace('@s.whatsapp.net', '');
                missingUsers.push(`@${phone}`);
            }
        });

        if (missingUsers.length === 0) return;

        const text = `📢 *תזכורת חודשית משמעון!* 📢\n\n` +
                     `שמתי לב שחלק מכם עדיין לא עדכנו יום הולדת:\n` +
                     `${missingUsers.join('\n')}\n\n` +
                     `פשוט תכתבו את התאריך (למשל: 24.10.1990) ואני ארשום אתכם! 🎁`;

        // שימוש בשדרן לשליחת ההודעה
        broadcaster.sendDirectWhatsApp(this.clients, text, missingUsers);
    }

    /**
     * מבצע את החגיגה
     */
    async celebrate(userId, userData) {
        const currentYear = new Date().getFullYear();
        
        // מניעת כפילות ברמת המשתמש (הגנה כפולה)
        if (userData.tracking?.lastBirthdayCelebrated === currentYear) return;

        // חישוב גיל עדכני
        const birthYear = userData.identity?.birthday?.year || 2000;
        const newAge = currentYear - birthYear;

        // 1. עדכון DB (מתנה + גיל)
        await db.collection('users').doc(userId).update({
            'economy.balance': require('firebase-admin').firestore.FieldValue.increment(GIFT_AMOUNT),
            'tracking.lastBirthdayCelebrated': currentYear,
            'identity.birthday.age': newAge
        });

        // עדכון מקומי לתצוגה
        userData.economy = userData.economy || { balance: 0 };
        userData.economy.balance += GIFT_AMOUNT;
        userData.identity.birthday.age = newAge;

        try {
            // 2. יצירת תמונה דרך המערכת החדשה ✅
            const cardBuffer = await graphics.birthday.generateCard(userData);
            
            // 3. שידור לכל הפלטפורמות
            await broadcaster.broadcastCelebration(this.clients, userData, cardBuffer);
            
        } catch (error) {
            log(`❌ [BirthdayManager] נכשל בחגיגה ל-${userId}: ${error.message}`);
        }
    }
}

module.exports = new BirthdayManager();