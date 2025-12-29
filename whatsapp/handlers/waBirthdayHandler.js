const db = require('../../utils/firebase');
const admin = require('firebase-admin');
const { log } = require('../../utils/logger');
const { sendToMainGroup } = require('../index');

// עדכון יום הולדת (נקרא מה-Logic)
async function updateBirthday(senderId, dateStr) {
    // פורמט מצופה מה-AI: "DD/MM" או "DD.MM"
    const [day, month] = dateStr.split(/[\/\.]/).map(n => parseInt(n));
    
    if (!day || !month || day > 31 || month > 12) return "תאריך לא חוקי נשמה.";

    const userRef = db.collection('whatsapp_users').doc(senderId);
    const doc = await userRef.get();
    
    let targetRef = userRef;
    // אם מקושר לדיסקורד, שומרים בתיק האב!
    if (doc.exists && doc.data().discordId) {
        targetRef = db.collection('users').doc(doc.data().discordId);
    }

    // שמירה בפורמט אחיד
    await targetRef.set({
        birthday: { day, month }
    }, { merge: true });

    return `רשמתי. ${day}/${month}. דואג לך לחגיגה.`;
}

// 🎂 בדיקה יומית (רצה כל בוקר)
async function checkDailyBirthdays() {
    const now = new Date();
    const todayDay = now.getDate();
    const todayMonth = now.getMonth() + 1;

    console.log(`[Birthday] 🎂 Checking for birthdays: ${todayDay}/${todayMonth}`);

    // אנחנו צריכים לחפש גם ב-users וגם ב-whatsapp_users
    // (אבל למען האמת, כל המידע אמור להיות ב-users אם עשינו Master Record)
    const usersSnap = await db.collection('users').get();
    
    let birthdays = [];

    usersSnap.forEach(doc => {
        const data = doc.data();
        if (data.birthday && data.birthday.day === todayDay && data.birthday.month === todayMonth) {
            // אם יש לו וואטסאפ, נחגוג לו שם
            if (data.platforms?.whatsapp) {
                birthdays.push(data.platforms.whatsapp);
            }
        }
    });

    if (birthdays.length > 0) {
        const mentions = birthdays;
        const blessing = `🎊 **יום הולדת שמח!** 🎊\n@${birthdays.map(p=>p.split('@')[0]).join(' @')}\nשמעון והצוות מאחלים לכם ים של ניצחונות, 0 לאגים, ושלא תשברו ציוד השנה. 🎈`;
        
        await sendToMainGroup(blessing, mentions);
        console.log(`✅ חגגנו ל-${birthdays.length} משתמשים.`);
    }
}

// 📢 הצקה חודשית (מי לא עדכן?)
async function nagMissingBirthdays() {
    const waUsers = await db.collection('whatsapp_users').get();
    let missingPhones = [];

    // נעבור על משתמשי וואטסאפ ונבדוק אם יש להם יום הולדת (אצלם או בתיק האב)
    for (const doc of waUsers.docs) {
        const waData = doc.data();
        let hasBday = false;

        if (waData.birthday) hasBday = true;
        
        // בדיקה בתיק האב
        if (!hasBday && waData.discordId) {
            const masterDoc = await db.collection('users').doc(waData.discordId).get();
            if (masterDoc.exists && masterDoc.data().birthday) hasBday = true;
        }

        if (!hasBday) {
            missingPhones.push(doc.id);
        }
    }

    // אם הרשימה ארוכה מידי, ניקח רק 5 אקראיים כדי לא להספים את כל העולם
    const victims = missingPhones.sort(() => 0.5 - Math.random()).slice(0, 5);
    
    if (victims.length > 0) {
        const msg = `📢 **הודעת מנהלה**\n@${victims.join(' @')}\nעדיין לא רשום לי היום הולדת שלכם.\nתעשו טובה, תרשמו כאן "היום הולדת שלי ב-XX/XX" כדי שנדע מתי לקנות לכם מתנה (סתם, לא נקנה כלום).`;
        await sendToMainGroup(msg, victims);
    }
}

module.exports = { updateBirthday, checkDailyBirthdays, nagMissingBirthdays };