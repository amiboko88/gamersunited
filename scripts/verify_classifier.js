require('dotenv').config();
const classifier = require('../handlers/intel/services/classifier');
const manager = require('../handlers/intel/manager');
const { log } = require('../utils/logger');

// Mock Broadcaster/Enricher to avoid external calls if needed, 
// but we want to test the ROUTING logic primarily.

(async () => {
    console.log('🚀 Starting Intel System 2.0 Verification...');

    const testCases = [
        "שמעון תן לי בילד לmpc25",
        "שמעון מה חדש בנוידיה",
        "תן לי עדכון על COD",
        "איזה מודים יש בוורזון?",
        "תביא לי בילד ל-iso hemlock"
    ];

    for (const query of testCases) {
        console.log(`\n🧪 Testing Query: "${query}"`);

        try {
            // 1. Test Classification
            console.time('Classification');
            const classification = await classifier.classify(query);
            console.timeEnd('Classification');
            console.log('🧠 Classification Result:', JSON.stringify(classification, null, 2));

            // 2. Test Manager Routing (Dry Run - detailed logs in manager will show path)
            // We won't await full execution to avoid spamming real APIs in this quick check, 
            // unless we want to prove it works end-to-end.
            // Let's just log the intent for now.

            if (classification.intent === 'WEAPON_META') {
                console.log('✅ Route: WEAPON_META -> would call getMeta()');
            } else if (classification.intent === 'DRIVER_UPDATE') {
                console.log('✅ Route: DRIVER_UPDATE -> would call getNvidia()');
            } else {
                console.log(`✅ Route: ${classification.intent}`);
            }

        } catch (e) {
            console.error('❌ Failed:', e.message);
        }
    }

    console.log('\n✅ Verification Complete.');
    process.exit(0);
})();
