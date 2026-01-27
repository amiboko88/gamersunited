const db = require('./utils/firebase');
const { log } = require('./utils/logger');

async function inspectYogi() {
    console.log("🔍 Inspecting Yogi's games...");

    // 1. Find Yogi
    const usersSnap = await db.collection('users').get();
    let yogiId = null;

    usersSnap.forEach(doc => {
        const d = doc.data();
        const aliases = [d.identity?.displayName, d.identity?.battleTag, ...(d.identity?.aliases || [])].map(a => a?.toLowerCase());
        if (aliases.includes('yogi') || aliases.includes('yogiツ')) {
            yogiId = doc.id;
            console.log(`✅ Found Yogi: ${d.identity?.displayName} (${doc.id})`);
        }
    });

    if (!yogiId) return console.log("❌ Yogi not found.");

    // 2. Fetch Games (Last 7 Days)
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const gamesRef = db.collection('users').doc(yogiId).collection('games');
    const snap = await gamesRef.where('timestamp', '>=', weekAgo).orderBy('timestamp', 'desc').get();

    console.log(`📊 Found ${snap.size} games in last 7 days.`);

    let totalKills = 0;

    snap.forEach(doc => {
        const d = doc.data();
        totalKills += (parseInt(d.kills) || 0);
        console.log(`- [${d.timestamp.toDate().toLocaleString()}] Kills: ${d.kills}, Dmg: ${d.damage}, Mode: ${d.mode}, ID: ${doc.id}`);
    });

    console.log(`\n🧮 Total Kills Sum: ${totalKills}`);
}

inspectYogi().then(() => process.exit());
