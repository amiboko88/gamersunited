const db = require('./utils/firebase');

async function auditYogiYesterday() {
    const userId = '420939460725964801'; // Yogi
    console.log(`🕵️ Auditing Yogi (Yesterday Range Logic)...`);

    // Replicate exactly the "Yesterday" logic from show_leaderboard.js
    let queryDate = new Date();
    queryDate.setDate(queryDate.getDate() - 1);
    queryDate.setHours(0, 0, 0, 0);

    const now = new Date();
    console.log(`📅 Query Range: ${queryDate.toLocaleString()} -> ${now.toLocaleString()}`);

    const gamesRef = db.collection('users').doc(userId).collection('games');
    const snap = await gamesRef.where('timestamp', '>=', queryDate).get();

    let k = 0;
    let d = 0;
    let games = 0;

    snap.forEach(doc => {
        const data = doc.data();
        k += (parseInt(data.kills) || 0);
        d += (parseInt(data.damage) || 0);
        games++;
        // console.log(`- ${data.timestamp.toDate().toLocaleString()}: ${data.kills}K, ${data.damage}D`);
    });

    console.log(`📊 Result: ${games} Matches, ${k} Kills, ${d} Damage`);
}

auditYogiYesterday().then(() => process.exit());
