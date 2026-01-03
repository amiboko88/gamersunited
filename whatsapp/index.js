const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const coreLogic = require('./logic/core'); // ✅ מפנה למוח הלוגי של וואטסאפ

let sock;
const GROUP_ID_PATTERN = /@g\.us$/;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ["Shimon Bot", "Chrome", "1.0.0"]
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ [WhatsApp] נותק. מנסה להתחבר מחדש:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ [WhatsApp] מחובר בהצלחה!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // טיפול בהודעות נכנסות
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            if (msg.key.remoteJid === 'status@broadcast') return;

            // חילוץ טקסט
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";
            
            // שליחה למוח הלוגי (Core) שמפעיל את הבאפר ואת הניתוח
            await coreLogic.handleMessageLogic(sock, msg, text);

        } catch (err) {
            console.error('❌ Error processing message:', err);
        }
    });
}

// פונקציה לשליחה לקבוצה ראשית (עבור קזינו/התראות)
async function sendToMainGroup(text, mentions = []) {
    const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID; 
    if (sock && MAIN_GROUP_ID) {
        await sock.sendMessage(MAIN_GROUP_ID, { text, mentions });
    }
}

module.exports = { connectToWhatsApp, sendToMainGroup };