// 📁 whatsapp/index.js
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { useFirestoreAuthState } = require('./auth'); 
const coreLogic = require('./logic/core'); 
const { ensureUserExists } = require('../utils/userUtils'); // ✅ חובה לסינכרון DB
const { log } = require('../utils/logger'); // שימוש בלוגר המרכזי

let sock; // משתנה גלובלי להחזקת החיבור
const msgRetryCounterCache = new Map();
const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID;

async function connectToWhatsApp() {
    // 1. סגירת חיבור ישן אם קיים (מונע כפילויות)
    if (sock) {
        console.log('⚠️ [WhatsApp] סוגר חיבור ישן לפני חיבור חדש...');
        try { sock.end(undefined); } catch(e){}
    }

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
                // לא מתחבר מחדש אם נותקנו בגלל לוגאוט או החלפת חיבור (440)
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 440; 
                
                console.log(`❌ [WhatsApp] נותק (${statusCode}). מתחבר מחדש: ${shouldReconnect}`);
                
                if (shouldReconnect) setTimeout(connectToWhatsApp, 3000);
            } else if (connection === 'open') {
                console.log('✅ [WhatsApp] מחובר ומוכן!');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // --- ✅ תוספת 1: זיהוי כניסה/יציאה מקבוצות (ברוכים הבאים) ---
        sock.ev.on('group-participants.update', async (notification) => {
            if (notification.id !== MAIN_GROUP_ID) return;

            const { action, participants } = notification;
            
            for (const participant of participants) {
                const phone = participant.split('@')[0];
                
                if (action === 'add') {
                    console.log(`👋 [WhatsApp] משתמש הצטרף: ${phone}`);
                    // רישום ראשוני ב-DB (שם זמני עד שישלח הודעה)
                    await ensureUserExists(participant, "Gamer (New)", "whatsapp");

                    // הודעת ברוכים הבאים
                    const welcomeText = `👋 ברוך הבא לקבוצה @${phone}!\nתציג את עצמך שנכיר.`;
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
                
                // --- ✅ תוספת 2: עדכון פרטי משתמש ב-DB בכל הודעה ---
                // זה מה שמבטיח שהשם והמספר יסתנכרנו תמיד ולא יהיו "Unknown"
                const senderJid = msg.key.participant || msg.key.remoteJid;
                const pushName = msg.pushName;
                
                if (pushName) {
                     // שליחה אסינכרונית כדי לא לעכב את הבוט
                     ensureUserExists(senderJid, pushName, "whatsapp").catch(e => console.error('[DB Sync Error]', e.message));
                }

                // שליחה ללוגיקה
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
    if (!sock || !MAIN_GROUP_ID) return;
    try {
        if (imageBuffer) {
            await sock.sendMessage(MAIN_GROUP_ID, { image: imageBuffer, caption: text, mentions });
        } else {
            await sock.sendMessage(MAIN_GROUP_ID, { text, mentions });
        }
    } catch (err) { console.error('❌ [WhatsApp Send Error]:', err.message); }
}

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

// --- ✅ תוספת 3: חשיפת הסוקט למערכות חיצוניות (כמו Leaderboard) ---
function getWhatsAppSock() {
    return sock;
}

module.exports = { connectToWhatsApp, sendToMainGroup, disconnectWhatsApp, getWhatsAppSock };