const db = require('./firebase');

async function testWrite() {
  const docRef = db.collection('בדיקה').doc('מסמך1');
  await docRef.set({
    שם: 'שימי הבוט',
    מצב: 'באוויר',
    תאריך: new Date().toISOString()
  });

  console.log('✅ נכתב למסד נתונים!');
}

testWrite();