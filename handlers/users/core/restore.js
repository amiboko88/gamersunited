const db = require('../../../utils/firebase');
const { log } = require('../../../utils/logger');
const fs = require('fs');
const path = require('path');

async function restoreFromBackup() {
    try {
        const backupPath = path.join(__dirname, '../../../database_dump-BACKUP.json');

        if (!fs.existsSync(backupPath)) {
            return { success: false, message: 'Backup file not found' };
        }

        const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        const users = backupData.users || {};
        const stats = backupData.gameStats || {};

        let restoredCount = 0;
        let skippedCount = 0;
        const batch = db.batch();
        let batchOpCount = 0;

        // טעינת משתמשים קיימים למניעת דריסה מיותרת
        const snapshot = await db.collection('users').select('identity').get();
        const existingIds = new Set(snapshot.docs.map(doc => doc.id));

        for (const [userId, userData] of Object.entries(users)) {
            // בדיקות תקינות
            if (userId.length < 16) continue; // לא ID תקין - Hardened to 16
            if (existingIds.has(userId)) {
                // בדיקה חכמה למיזוג (Skeleton Check)
                // אם המשתמש קיים אך "ריק", נרצה לשחזר.
                // אבל כאן בגרסה הפשוטה (כחלק מה-Refactor) נשמור על הלוגיקה המקורית של הקובץ המאושר,
                // או שנשדרג לגרסה החכמה? המשתמש אישר את ה-Smart Fix בסקריפט הידני.
                // עדיף לשמור כאן את הגרסה הבטוחה והפשוטה, ואת החכם להריץ ידנית.
                skippedCount++;
                continue;
            }

            // שחזור המשתמש
            const userRef = db.collection('users').doc(userId);

            // ניסיון לשחזר גם גיימינג אם יש
            if (stats[userId]) {
                userData.gameStats = stats[userId];
                const gameRef = db.collection('gameStats').doc(userId);
                batch.set(gameRef, stats[userId], { merge: true });
                batchOpCount++;
            }

            batch.set(userRef, userData, { merge: true });
            restoredCount++;
            batchOpCount++;

            if (batchOpCount >= 400) {
                await batch.commit();
                batchOpCount = 0;
            }
        }

        if (batchOpCount > 0) await batch.commit();

        return { success: true, restored: restoredCount, skipped: skippedCount };
    } catch (error) {
        console.error('Restore Error:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { restoreFromBackup };
