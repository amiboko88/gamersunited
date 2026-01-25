// firebase.js
const admin = require('firebase-admin');
const path = require('path');

let serviceAccount;
try {
  if (process.env.FIREBASE_CREDENTIAL) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIAL);
  } else {
    // Fallback for local development (Antigravity/Agent)
    serviceAccount = require('../serviceAccountKey.json');
  }
} catch (e) {
  console.error("❌ Failed to load Firebase Credentials:", e.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: serviceAccount.project_id ? `${serviceAccount.project_id}.appspot.com` : undefined
});

const db = admin.firestore();

module.exports = db;