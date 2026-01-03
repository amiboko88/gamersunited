const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const coreLogic = require('./logic/core'); 

let sock;
const GROUP_ID_PATTERN = /@g\.us$/;

async function connectToWhatsApp() {
    // טעינת הסשן הקיים (התיקייה שלא מחקנו)
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    console.log(`🔄 [WhatsApp] מתחבר... (גרסה ${version.join('.')})`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        // printQRInTerminal: true,  <-- מחקתי את השורה הזו שעשתה בעיות!
        auth: state,
        browser: ["Shimon Bot", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        syncFullHistory: false
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ [WhatsApp] נותק. מנסה להתחבר מחדש:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 3000); // השהייה קטנה לפני ניסיון חוזר
            }
        } else if (connection === 'open') {
            console.log('✅ [WhatsApp] מחובר בהצלחה!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // טיפול בהודעות
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            if (msg.key.remoteJid === 'status@broadcast') return;

            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
            
            // שליחה למוח הלוגי
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