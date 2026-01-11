// 📁 whatsapp/index.js
// תיקון הייבוא: מייבאים את הכל מאובייקט אחד
const { 
    default: makeWASocket, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeInMemoryStore 
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const { useFirestoreAuthState } = require('./auth'); 
const coreLogic = require('./logic/core'); 
const { ensureUserExists } = require('../utils/userUtils'); 
const { log } = require('../utils/logger'); 
const whatsappScout = require('./utils/scout');
const matchmaker = require('../handlers/matchmaker'); 

// בדיקת שפיות: אם הפונקציה עדיין לא קיימת, נמנע קריסה
if (typeof makeInMemoryStore !== 'function') {
    console.error("❌ Critical Error: 'makeInMemoryStore' is not defined. Please run: npm update @whiskeysockets/baileys");
    process.exit(1);
}

// ✅ אתחול הזיכרון (Store)
const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });

let sock; 
const msgRetryCounterCache = new Map();
const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID;

/**
 * 🔍 פונקציית הקסם: ממירה כל מזהה (LID/JID) למספר טלפון אמיתי
 */
function getRealPhoneNumber(jid) {
    if (!jid) return '';
    
    if (jid.includes('@s.whatsapp.net') && !jid.includes(':')) {
        return jid.split('@')[0];
    }

    const contact = store.contacts[jid] || Object.values(store.contacts).find(c => c.lid === jid);
    
    if (contact && contact.id) {
        return contact.id.split('@')[0];
    }

    return jid.split('@')[0];
}

async function connectToWhatsApp() {
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

        // ✅ מחברים את ה-Store לאירועים של הסוקט
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
                    }, 10000); 
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
                    
                    if (!userRef) {
                        // אם המשתמש לא קיים (ensure החזיר null), ה-Matchmaker יטפל בו בהודעה הראשונה
                        // אבל הודעת ברוכים הבאים תמיד נחמד לשלוח
                    }

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
                
                const rawJid = msg.key.participant || msg.key.remoteJid;
                const realSenderPhone = getRealPhoneNumber(rawJid);
                const pushName = msg.pushName || "Unknown";
                
                // 1. נסיון לעדכון/בדיקת קיום ב-DB
                const userRef = await ensureUserExists(realSenderPhone, pushName, "whatsapp");

                // אם userRef הוא null (כי חסמנו יצירה), או שהמסמך לא קיים
                if (!userRef) {
                    console.log(`🛡️ [WhatsApp] משתמש לא מזוהה: ${realSenderPhone} (${pushName}). מפעיל שדכן.`);
                    
                    const isNameConfirmed = await matchmaker.confirmNameMatch(sock, realSenderPhone, text, pushName);
                    
                    if (!isNameConfirmed) {
                        await matchmaker.handleStranger(sock, realSenderPhone, pushName);
                    }
                    return; 
                }

                // בדיקה נוספת למקרה שה-ref קיים אבל המסמך נמחק ידנית
                const userDoc = await userRef.get();
                if (!userDoc.exists) {
                     console.log(`🛡️ [WhatsApp] משתמש זוהה כרפאים (Ref קיים, Doc חסר). מפעיל שדכן.`);
                     await matchmaker.handleStranger(sock, realSenderPhone, pushName);
                     return;
                }

                // 2. אם המשתמש קיים - ממשיכים רגיל
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

function getWhatsAppSock() { return sock; }
function getResolver() { return getRealPhoneNumber; } 

module.exports = { connectToWhatsApp, sendToMainGroup, disconnectWhatsApp, getWhatsAppSock, getResolver };