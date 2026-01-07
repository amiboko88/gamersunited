// 📁 whatsapp/index.js
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { useFirestoreAuthState } = require('./auth'); 
const coreLogic = require('./logic/core'); // הלוגיקה החדשה

// משתנים גלובליים
let sock;
const msgRetryCounterCache = new Map();
const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID; // וודא שזה קיים ב-.env

async function connectToWhatsApp() {
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
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
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

                // חילוץ טקסט נקי
                const text = msg.message.conversation || 
                             msg.message.extendedTextMessage?.text || 
                             msg.message.imageMessage?.caption || "";
                
                // העברה למוח החדש
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

/**
 * ✅ הפונקציה שמאפשרת למערכת המשתמשים ולמערכת ימי ההולדת לשלוח הודעות לקבוצה
 */
async function sendToMainGroup(text, mentions = [], imageBuffer = null) {
    if (!sock || !MAIN_GROUP_ID) {
        console.warn('⚠️ [WhatsApp] לא ניתן לשלוח הודעה (Socket מנותק או אין ID קבוצה).');
        return;
    }

    try {
        if (imageBuffer) {
            await sock.sendMessage(MAIN_GROUP_ID, { 
                image: imageBuffer, 
                caption: text,
                mentions: mentions
            });
        } else {
            await sock.sendMessage(MAIN_GROUP_ID, { 
                text: text, 
                mentions: mentions 
            });
        }
    } catch (err) {
        console.error('❌ [WhatsApp Send Error]:', err.message);
    }
}

module.exports = { connectToWhatsApp, sendToMainGroup };