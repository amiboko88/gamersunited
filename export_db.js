const fs = require('fs');
const admin = require('firebase-admin');

// ✅ שינוי: טעינת המפתח מהקובץ המקומי שהורדת
// וודא שהקובץ serviceAccountKey.json נמצא באותה תיקייה!
let serviceAccount;
try {
    serviceAccount = require('./serviceAccountKey.json');
} catch (e) {
    console.error("❌ שגיאה: לא מצאתי את הקובץ serviceAccountKey.json בתיקייה.");
    console.error("אנא הורד אותו מפיירבייס ושים אותו כאן.");
    process.exit(1);
}

// ✅ אתחול פיירבייס במיוחד לסקריפט הזה
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function exportFirestoreData() {
    console.log("⏳ מתחיל ייצוא של הדאטה-בייס...");

    try {
        const collections = await db.listCollections();
        const exportData = {};

        for (const collection of collections) {
            const collectionName = collection.id;

            // דילוג על קולקשנים טכניים
            if (collectionName === 'whatsapp_auth') {
                continue;
            }

            console.log(`📥 שואב נתונים מקולקשן: ${collectionName}...`);
            const snapshot = await collection.get();
            
            exportData[collectionName] = {};

            if (snapshot.empty) {
                console.log(`   (ריק)`);
                continue;
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                
                // המרת תאריכים למחרוזות
                Object.keys(data).forEach(key => {
                    if (data[key] && typeof data[key].toDate === 'function') {
                        data[key] = data[key].toDate().toISOString();
                    }
                });

                exportData[collectionName][doc.id] = data;
            });
        }

        fs.writeFileSync('database_dump.json', JSON.stringify(exportData, null, 2));
        console.log("\n✅ הייצוא הושלם! הקובץ database_dump.json מוכן.");

    } catch (error) {
        console.error("❌ שגיאה בייצוא:", error);
    }
}

exportFirestoreData();