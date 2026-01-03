// 📁 whatsapp/handlers/waBirthdayHandler.js
const db = require('../../utils/firebase');
const { getUserRef } = require('../../utils/userUtils'); // ✅ שימוש בתשתית המאוחדת
const { sendToMainGroup } = require('../index');

async function updateBirthday(senderId, dateStr) {
    const [day, month] = dateStr.split(/[\/\.]/).map(n => parseInt(n));
    
    if (!day || !month || day > 31 || month > 12) return "תאריך לא חוקי נשמה.";

    // שימוש ב-userUtils כדי למצוא את המסמך הראשי
    const userRef = await getUserRef(senderId, 'whatsapp');

    // שמירה בפורמט המאוחד תחת identity.birthday
    await userRef.set({
        identity: {
            birthday: { day, month }
        }
    }, { merge: true });

    return `רשמתי. ${day}/${month}. דואג לך לחגיגה.`;
}

// בדיקה יומית (רצה מה-cron)
async function checkDailyBirthdays() {
    const now = new Date();
    const todayDay = now.getDate();
    const todayMonth = now.getMonth() + 1;

    // סריקת הקולקשן הראשי users
    const snapshot = await db.collection('users').get();
    let birthdays = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const bday = data.identity?.birthday;
        if (bday && bday.day === todayDay && bday.month === todayMonth) {
            // אם זה משתמש וואטסאפ (יש לו שדה מקשר או שהוא מקושר ידנית)
            // לצורך הפשטות, נחגוג לכולם בקבוצה הראשית
            birthdays.push(data.identity?.displayName || "חבר יקר");
        }
    });

    if (birthdays.length > 0) {
        const blessing = `
        🎉 **יום הולדת שמח!**
        היום חוגגים: ${birthdays.join(', ')} 🎂
        
        שמעון והצוות מאחלים לכם 0 לאגים ו-KD חיובי!
        `;
        await sendToMainGroup(blessing);
    }
}

module.exports = { updateBirthday, checkDailyBirthdays };