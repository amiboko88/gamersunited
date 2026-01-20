// --- Mock Global Firebase Admin ---
const mockAdmin = {
    initializeApp: () => { },
    firestore: () => ({
        collection: (name) => ({
            doc: (id) => ({
                get: async () => ({
                    exists: true,
                    data: () => ({
                        last_patch_date: 0,
                        last_title: "Old Title",
                        last_nvidia_title: "Old Driver",
                        last_bf6_title: "Old Update"
                    })
                }),
                set: async (data) => console.log(`💾 [MOCK DB] Saved to ${name}/${id}:`, data)
            })
        })
    }),
    credential: { cert: () => { } }
};

try {
    const adminPath = require.resolve('firebase-admin');
    require.cache[adminPath] = {
        id: adminPath,
        filename: adminPath,
        loaded: true,
        exports: mockAdmin
    };
} catch (e) { console.log('Could not mock firebase-admin'); }

// --- Mock Firebase Util ---
const path = require('path');
const mockDb = {
    collection: (name) => ({
        doc: (id) => ({
            get: async () => ({
                exists: true,
                data: () => ({
                    last_patch_date: 0,
                    last_title: "Old Title",
                    last_nvidia_title: "Old Driver",
                    last_bf6_title: "Old Update"
                })
            }),
            set: async (data) => console.log(`💾 [MOCK DB] Saved to ${name}/${id}:`, data)
        })
    })
};

const fbPath = path.resolve(__dirname, '../utils/firebase.js');
require.cache[fbPath] = {
    id: fbPath,
    filename: fbPath,
    loaded: true,
    exports: mockDb
};

// --- Mock Broadcaster Service ---
const broadcasterPath = path.resolve(__dirname, '../handlers/intel/services/broadcaster.js');
const mockBroadcaster = {
    broadcast: async (item) => {
        console.log(`\n📢 [MOCK BROADCAST] Title: ${item.title}`);
        console.log(`   Summary: ${item.summary ? item.summary.split('\n')[0] : 'No Summary'}...`);
        console.log(`   Link: ${item.link}\n`);
    }
};

require.cache[broadcasterPath] = {
    id: broadcasterPath,
    filename: broadcasterPath,
    loaded: true,
    exports: mockBroadcaster
};

// --- Mock AI Brain ---
const brainPath = path.resolve(__dirname, '../handlers/ai/brain.js');
const mockBrain = {
    generateInternal: async (prompt) => {
        if (prompt.includes('User searched for weapon')) return "M4A1";
        return "🤖 [MOCK AI SUMMARY] content.";
    }
};

require.cache[brainPath] = {
    id: brainPath,
    filename: brainPath,
    loaded: true,
    exports: mockBrain
};

const manager = require('../handlers/intel/manager');
const { log } = require('../utils/logger');

async function runVerification() {
    console.log("🚀 Starting Intel System 2.1 Verification (Fixes) 🚀\n");

    // 1. Initialize
    await manager.initIntel({}, {}, {});
    console.log("✅ Initialization Complete\n");

    // 2. Test Automated Cycle 
    console.log("--- 2. Automated Cycle ---");
    await manager.checkNews();

    // 3. Test Routing Fixes
    console.log("\n--- 3. Routing Tests ---");

    const queries = [
        "give me meta",           // COD Meta
        "build for sgx",          // BF6 Weapon (Cross-Game Search)
        "bf6 update",             // BF6 Update (Routing Priority)
        "nvidia update",          // Nvidia Update (Routing Priority)
        "what was in last nvidia update", // Natural Language
        "bf6 meta"                // BF6 Meta
    ];

    for (const q of queries) {
        console.log(`\n❓ Query: "${q}"`);
        const result = await manager.handleNaturalQuery(q);

        if (typeof result === 'string') {
            console.log(`👉 Response: ${result.slice(0, 100).replace(/\n/g, ' ')}...`);
        } else if (result && typeof result === 'object' && result.text) {
            console.log(`👉 Response (Weapon/Obj): ${result.text.slice(0, 100).replace(/\n/g, ' ')}...`);
        } else if (result && result.title) {
            console.log(`👉 Response (Update): ${result.title}`);
        } else {
            console.log(`❌ No Response or Null`);
        }
    }

    console.log("\n✅ Verification Finished.");
    process.exit(0);
}

runVerification();
