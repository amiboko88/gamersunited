// 📁 whatsapp/index.js
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { useFirestoreAuthState } = require('./auth'); 
const coreLogic = require('./logic/core'); 

let sock; // משתנה גלובלי
const msgRetryCounterCache = new Map();
const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID;

async function connectToWhatsApp() {
    // ... (כל הקוד המקורי שלך נשאר זהה עד ה-catch) ...
    // אני לא מעתיק את הכל כדי לחסוך מקום, תשאיר את הפונקציה הזו כמו שהיא אצלך
    // רק תוודא שהיא מתחילה ב: try { const { version } ...
    
    // בתוך ה-try, תוסיף בהתחלה:
    if (sock) {
        console.log('⚠️ [WhatsApp] סוגר חיבור ישן לפני חיבור חדש...');
        sock.end(undefined);
    }
    
    // ... המשך הקוד הרגיל ...
    
    // --- שים את הקוד המקורי שלך כאן ---
    
    try {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useFirestoreAuthState();

        console.log(`🔄 [WhatsApp] מתחבר... (גרסה ${version.join('.')})`);

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            msgRetryCounterCache,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            browser: ["Shimon Bot", "Chrome", "1.0.0"],
            syncFullHistory: false
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) console.log('⚠️ [WhatsApp] סרוק QR בטרמינל.');

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                // תיקון: אם זה 440 (הוחלף) או 503 (שרת עמוס), לא מנסים מייד
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 440; 
                
                console.log(`❌ [WhatsApp] נותק (${statusCode}). מתחבר מחדש: ${shouldReconnect}`);
                
                if (shouldReconnect) setTimeout(connectToWhatsApp, 3000);
            } else if (connection === 'open') {
                console.log('✅ [WhatsApp] מחובר ומוכן!');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message || msg.key.fromMe) return;
                if (msg.key.remoteJid === 'status@broadcast') return;

                const text = msg.message.conversation || 
                             msg.message.extendedTextMessage?.text || 
                             msg.message.imageMessage?.caption || "";
                
                await coreLogic.handleMessageLogic(sock, msg, text);

            } catch (err) {
                console.error('❌ [WhatsApp Logic Error]:', err);
            }
        });

    } catch (error) {
        console.error('❌ [WhatsApp Fatal Error]:', error);
        setTimeout(connectToWhatsApp, 5000);
    }
}

async function sendToMainGroup(text, mentions = [], imageBuffer = null) {
    if (!sock || !MAIN_GROUP_ID) return;
    try {
        if (imageBuffer) {
            await sock.sendMessage(MAIN_GROUP_ID, { image: imageBuffer, caption: text, mentions });
        } else {
            await sock.sendMessage(MAIN_GROUP_ID, { text, mentions });
        }
    } catch (err) { console.error('❌ [WhatsApp Send Error]:', err.message); }
}

// ✅ הפונקציה החדשה שחייבים להוסיף!
async function disconnectWhatsApp() {
    if (sock) {
        console.log('🛑 [WhatsApp] מנתק חיבור יזום...');
        try {
            sock.end(undefined);
            sock = null;
        } catch (e) {
            console.error('Error closing WhatsApp:', e.message);
        }
    }
}

// אל תשכח לייצא את הפונקציה החדשה
module.exports = { connectToWhatsApp, sendToMainGroup, disconnectWhatsApp };