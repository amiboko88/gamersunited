// 📁 whatsapp/index.js
const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { useFirestoreAuthState } = require('./auth'); 
const coreLogic = require('./logic/core'); 
const { ensureUserExists } = require('../utils/userUtils'); 
const { log } = require('../utils/logger'); 
const whatsappScout = require('./utils/scout');
const matchmaker = require('../handlers/matchmaker'); 
const store = require('./store'); // ✅ ה-Store המשודרג

let sock; 
const msgRetryCounterCache = new Map();
const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID;

/**
 * 🔍 פונקציית הקסם: ממירה כל מזהה (LID/JID) למספר טלפון אמיתי
 * משתמשת במנוע המשודרג של ה-Store
 */
function getRealPhoneNumber(jid) {
    if (!jid) return '';
    // ה-Store החדש יודע לחפש גם בהיסטוריה וגם במיפויים
    return store.getPhoneById(jid);
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
            syncFullHistory: true // ✅ מבקשים היסטוריה מלאה (חשוב למיפוי)
        });

        // ✅ מחברים את ה-Store
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
                // מפעילים את הסייר (Scout) רק אחרי זמן מה, לתת להיסטוריה להיטען
                if (MAIN_GROUP_ID) {
                    setTimeout(() => {
                        whatsappScout.syncGroupMembers(sock, MAIN_GROUP_ID);
                    }, 15000); // נותנים 15 שניות להיסטוריה לטעון את ה-LIDs
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
                    
                    // ברוכים הבאים
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
                
                // הכתובת לזיהוי המשתמש (יכולה להיות LID)
                const senderIdentifier = msg.key.participant || msg.key.remoteJid;
                
                // נסיון פענוח למספר אמיתי דרך ה-Store המשודרג
                const realSenderPhone = getRealPhoneNumber(senderIdentifier);
                const pushName = msg.pushName || "Unknown";
                
                // לוג דיבוג קטן לראות אם ההמרה הצליחה
                if (senderIdentifier !== realSenderPhone) {
                    // console.log(`🔍 [Debug] LID Converted: ${senderIdentifier} -> ${realSenderPhone}`);
                }

                // 1. נסיון שליפה מה-DB
                // עכשיו, כש realSenderPhone הוא המספר האמיתי שלך (972...), הפונקציה תמצא אותך!
                const userRef = await ensureUserExists(realSenderPhone, pushName, "whatsapp");

                // 2. משתמש לא מזוהה (עדיין חוסמים זרים)
                if (!userRef) {
                    console.log(`🛑 [WhatsApp Block] משתמש לא מקושר: ${realSenderPhone} (${pushName}). מפעיל שדכן.`);
                    
                    // כתובת למענה
                    const replyToJid = msg.key.remoteJid; 
                    
                    const isNameConfirmed = await matchmaker.confirmNameMatch(sock, replyToJid, realSenderPhone, text, pushName);
                    if (!isNameConfirmed) {
                        await matchmaker.handleStranger(sock, replyToJid, realSenderPhone, pushName);
                    }
                    return; 
                }

                // בדיקת שפיות
                const userDoc = await userRef.get();
                if (!userDoc.exists) {
                     await matchmaker.handleStranger(sock, msg.key.remoteJid, realSenderPhone, pushName);
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