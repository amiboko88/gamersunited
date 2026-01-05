// 📁 utils/testFirestore.js
const db = require('./firebase');

async function testWrite() {
  console.log('🔄 בודק חיבור ל-Firestore...');
  try {
      const docRef = db.collection('system_metadata').doc('connection_test');
      await docRef.set({
        status: 'online',
        timestamp: new Date().toISOString(),
        checkedBy: 'ShimonBot'
      });

      console.log('✅ הצלחה! נכתב למסד הנתונים (system_metadata).');
      
      // בדיקת קריאה
      const doc = await docRef.get();
      if (doc.exists) {
          console.log('✅ הצלחה! נקרא ממסד הנתונים.');
      }
  } catch (e) {
      console.error('❌ כישלון בבדיקת DB:', e);
  }
}

testWrite();