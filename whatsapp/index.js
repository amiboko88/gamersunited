const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const coreLogic = require('./logic/core'); 

// ✅ תיקון נתיב לפי העץ ששלחת: auth.js נמצא באותה תיקייה, לא ב-utils
const { useFirestoreAuthState } = require('./auth'); 

let sock;

async function connectToWhatsApp() {
    // טוען את הסשן מהקובץ auth.js שנמצא ליד ה-index.js
    const { state, saveCreds } = await useFirestoreAuthState();
    const { version } = await fetchLatestBaileysVersion();

    console.log(`🔄 [WhatsApp] טוען סשן מ-Firestore ומתחבר (גרסה ${version.join('.')})...`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ["Shimon Bot", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        syncFullHistory: false
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('⚠️ הסשן ב-DB פג תוקף או לא קיים. נא לסרוק QR מחדש.');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`❌ [WhatsApp] נותק. מתחבר מחדש: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 2000);
            }
        } else if (connection === 'open') {
            console.log('✅ [WhatsApp] מחובר בהצלחה! (הסשן נטען מהענן)');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            if (msg.key.remoteJid === 'status@broadcast') return;

            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
            
            await coreLogic.handleMessageLogic(sock, msg, text);

        } catch (err) {
            console.error('❌ Error processing message:', err);
        }
    });
}

async function sendToMainGroup(text, mentions = []) {
    const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID; 
    if (sock && MAIN_GROUP_ID) {
        try {
            await sock.sendMessage(MAIN_GROUP_ID, { text, mentions });
        } catch (err) {
            console.error('❌ Failed to send to main group:', err);
        }
    }
}

module.exports = { connectToWhatsApp, sendToMainGroup };