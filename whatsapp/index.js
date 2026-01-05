// 📁 whatsapp/index.js
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const coreLogic = require('./logic/core');
const { useFirestoreAuthState } = require('./auth'); 

// Cache לניסיונות שליחה חוזרים (מונע קריסות על הודעות תקועות)
const msgRetryCounterCache = new Map();

let sock;

async function connectToWhatsApp() {
    try {
        // טעינת גרסה ואימות
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useFirestoreAuthState();

        console.log(`🔄 [WhatsApp] מתחבר... (גרסה ${version.join('.')})`);

        sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }), // לוגים שקטים כדי לא להציף את הקונסולה
            printQRInTerminal: true,
            auth: state,
            msgRetryCounterCache, // ✅ קריטי ליציבות
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            browser: ["Shimon Bot", "Chrome", "1.0.0"],
            syncFullHistory: false // חוסך זיכרון
        });

        // ניהול אירועי חיבור
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('⚠️ [WhatsApp] סרוק את ה-QR בטרמינל כדי להתחבר.');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                // ניתוק יזום (Logged Out) לא יגרום לחיבור מחדש אוטומטי
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(`❌ [WhatsApp] נותק. קוד שגיאה: ${statusCode || 'N/A'}. מתחבר מחדש: ${shouldReconnect}`);

                if (shouldReconnect) {
                    // המתנה קלה לפני חיבור מחדש למניעת לופ מהיר
                    setTimeout(connectToWhatsApp, 3000); 
                }
            } else if (connection === 'open') {
                console.log('✅ [WhatsApp] מחובר בהצלחה!');
            }
        });

        // שמירת אימות (חובה)
        sock.ev.on('creds.update', saveCreds);

        // טיפול בהודעות נכנסות
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message || msg.key.fromMe) return;
                // התעלמות מעדכוני סטטוס
                if (msg.key.remoteJid === 'status@broadcast') return;

                // חילוץ טקסט
                const text = msg.message.conversation || 
                             msg.message.extendedTextMessage?.text || 
                             msg.message.imageMessage?.caption || "";
                
                // העברה ללוגיקה המרכזית
                await coreLogic.handleMessageLogic(sock, msg, text);

            } catch (err) {
                console.error('❌ [WhatsApp Logic Error]:', err);
            }
        });

    } catch (error) {
        console.error('❌ [WhatsApp Fatal Error]:', error);
        setTimeout(connectToWhatsApp, 5000); // נסיון התאוששות מאסון
    }
}

/**
 * פונקציה חיצונית לשליחת הודעות לקבוצה הראשית
 * (משמשת את ה-MVP ואת ה-Leaderboard)
 */
async function sendToMainGroup(text, mentions = [], imageBuffer = null) {
    const MAIN_GROUP_ID = process.env.WHATSAPP_MAIN_GROUP_ID; 
    
    if (!sock) {
        console.warn('⚠️ [WhatsApp] Socket not initialized. Cannot send message.');
        return;
    }
    if (!MAIN_GROUP_ID) {
        console.warn('⚠️ [WhatsApp] MAIN_GROUP_ID is missing in .env');
        return;
    }

    try {
        const payload = { 
            text: text, 
            mentions: mentions 
        };

        // אם יש תמונה, נשלח אותה עם כיתוב
        if (imageBuffer) {
            await sock.sendMessage(MAIN_GROUP_ID, { 
                image: imageBuffer, // יכול להיות Buffer או נתיב לקובץ
                caption: text,
                mentions: mentions
            });
        } else {
            // טקסט רגיל
            await sock.sendMessage(MAIN_GROUP_ID, payload);
        }
        
    } catch (err) {
        console.error('❌ [WhatsApp Send Error]:', err.message);
    }
}

module.exports = { connectToWhatsApp, sendToMainGroup };