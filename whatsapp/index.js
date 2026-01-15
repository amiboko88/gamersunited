const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { useFirestoreAuthState } = require('./auth');
const coreLogic = require('./logic/core');
const { ensureUserExists } = require('../utils/userUtils');
const { log } = require('../utils/logger');
const whatsappScout = require('./utils/scout');
const matchmaker = require('../handlers/matchmaker');
const store = require('./store');
const { setSocket, getSocket } = require('./socket');

const msgRetryCounterCache = new Map();
const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID;

function getRealPhoneNumber(jid) {
    if (!jid) return '';
    return store.getPhoneById(jid);
}

async function connectToWhatsApp() {
    const currentSock = getSocket();
    if (currentSock) {
        console.log('⚠️ [WhatsApp] סוגר חיבור ישן לפני חיבור חדש...');
        try { currentSock.end(undefined); } catch (e) { }
    }

    try {
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useFirestoreAuthState();

        console.log(`🔄 [WhatsApp] מתחבר... (גרסה ${version.join('.')})`);

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            auth: state,
            msgRetryCounterCache,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            browser: ["Shimon Bot", "Chrome", "1.0.0"],
            syncFullHistory: true
        });

        setSocket(sock); // ✅ שומרים במודול החיצוני

        store.bind(sock.ev);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) console.log('⚠️ [WhatsApp] סרוק QR בטרמינל.');
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 440;
                console.log(`❌ [WhatsApp] נותק (${statusCode}). מתחבר מחדש: ${shouldReconnect}`);
                if (shouldReconnect) setTimeout(connectToWhatsApp, 3000);
            }
            else if (connection === 'open') {
                console.log('✅ [WhatsApp] מחובר ומוכן!');
                if (MAIN_GROUP_ID) {
                    setTimeout(() => {
                        whatsappScout.syncGroupMembers(sock, MAIN_GROUP_ID);
                    }, 15000);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // --- ניהול כניסות/יציאות ---
        sock.ev.on('group-participants.update', async (notification) => {
            if (notification.id !== MAIN_GROUP_ID) return;
            const { action, participants } = notification;
            for (const participant of participants) {
                const realPhone = getRealPhoneNumber(participant);
                if (action === 'add') {
                    console.log(`👋 [WhatsApp] משתמש הצטרף: ${realPhone}`);
                    const userRef = await ensureUserExists(realPhone, "New Gamer", "whatsapp");
                    const welcomeText = `👋 ברוך הבא לקבוצה @${realPhone}!\nתציג את עצמך שנכיר.`;
                    await sock.sendMessage(MAIN_GROUP_ID, { text: welcomeText, mentions: [participant] });
                }
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message || msg.key.fromMe) return;
                if (msg.key.remoteJid === 'status@broadcast') return;

                const text = msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption || "";

                const senderIdentifier = msg.key.participant || msg.key.remoteJid;
                const realSenderPhone = getRealPhoneNumber(senderIdentifier);
                const pushName = msg.pushName || "Unknown";

                // 1. נסיון שליפה מה-DB
                const userRef = await ensureUserExists(realSenderPhone, pushName, "whatsapp");

                // 2. משתמש לא מזוהה -> רישום למאגר (במקום הודעה)
                if (!userRef) {
                    console.log(`🛑 [WhatsApp Block] זיהוי לא מוכר: ${realSenderPhone}. נשמר לטיפול בדיסקורד.`);
                    await matchmaker.registerOrphan(realSenderPhone, pushName, text);
                    return;
                }

                const userDoc = await userRef.get();
                if (!userDoc.exists) {
                    await matchmaker.registerOrphan(realSenderPhone, pushName, text);
                    return;
                }

                // 3. משתמש מאומת - ממשיכים
                if (coreLogic && coreLogic.handleMessageLogic) {
                    await coreLogic.handleMessageLogic(sock, msg, text);
                }

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
    const sock = getSocket();
    if (!sock || !MAIN_GROUP_ID) return;
    try {
        if (imageBuffer) {
            await sock.sendMessage(MAIN_GROUP_ID, {
                image: imageBuffer,
                caption: text,
                mimetype: 'image/png', // ✅ חובה עבור WhatsApp Desktop
                mentions
            });
        } else {
            await sock.sendMessage(MAIN_GROUP_ID, { text, mentions });
        }
    } catch (err) { console.error('❌ [WhatsApp Send Error]:', err.message); }
}

async function disconnectWhatsApp() {
    const sock = getSocket();
    if (sock) {
        console.log('🛑 [WhatsApp] מנתק חיבור יזום...');
        try {
            sock.end(undefined);
            setSocket(null);
        } catch (e) {
            console.error('Error closing WhatsApp:', e.message);
        }
    }
}

function getWhatsAppSock() { return getSocket(); }
function getResolver() { return getRealPhoneNumber; }

module.exports = { connectToWhatsApp, sendToMainGroup, disconnectWhatsApp, getWhatsAppSock, getResolver };