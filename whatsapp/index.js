const { makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { useFirestoreAuthState } = require('./auth');
const { handleMedia } = require('./media');
const { handleMessageLogic } = require('./logic');
const qrcode = require('qrcode');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { log } = require('../utils/logger'); 

const STAFF_CHANNEL_ID = '881445829100060723'; // הערוץ שאליו נשלח ה-QR
let sock;
let isConnected = false;
let retryCount = 0;

// ✅ פונקציית עזר קריטית: חילוץ טקסט גם מהודעות נסתרות/זמניות
function getMessageContent(msg) {
    if (!msg.message) return null;
    
    // פתיחת המעטפה של הודעות נסתרות (Ephemeral)
    const content = msg.message.ephemeralMessage?.message || msg.message;
    
    // בדיקת כל סוגי הטקסט האפשריים
    return content.conversation || 
           content.extendedTextMessage?.text || 
           content.imageMessage?.caption || 
           content.videoMessage?.caption ||
           null;
}

// ✅ פונקציה לייצוא: מאפשרת לקבצים אחרים (כמו המוניטור) לשלוח הודעות לקבוצה
async function sendToMainGroup(text) {
    const mainGroupId = process.env.WHATSAPP_MAIN_GROUP_ID; 

    if (!sock || !isConnected) {
        console.log('⚠️ WhatsApp send failed: Bot disconnected.');
        return;
    }
    if (!mainGroupId) {
        console.log('⚠️ WhatsApp send failed: No WHATSAPP_MAIN_GROUP_ID set in Env Vars.');
        return;
    }
    try {
        await sock.sendMessage(mainGroupId, { text: text });
    } catch (err) {
        console.error('❌ Send Error:', err.message);
    }
}

async function connectToWhatsApp(discordClient) {
    const { state, saveCreds } = await useFirestoreAuthState();

    sock = makeWASocket({
        printQRInTerminal: false, // אנחנו שולחים לדיסקורד, לא לטרמינל
        auth: state,
        browser: ["Shimon Bot", "Chrome", "1.0.0"],
        syncFullHistory: false, // חוסך זיכרון
        logger: require('pino')({ level: 'silent' }), // משתיק לוגים פנימיים של הספרייה
        connectTimeoutMs: 60000, 
        keepAliveIntervalMs: 10000,
        getMessage: async () => { return { conversation: 'hello' } } // מונע קריסות נדירות
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (isConnected && qr) return;

        // שליחת QR לדיסקורד
        if (qr) {
            log('[WhatsApp] 📸 New QR Code generated');
            try {
                const qrBuffer = await qrcode.toBuffer(qr);
                const file = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });
                const channel = await discordClient.channels.fetch(STAFF_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('📱 נדרשת סריקה לחיבור וואטסאפ')
                        .setDescription('סרוק את הקוד בטלפון כדי לחבר את שמעון.')
                        .setColor('#25D366')
                        .setImage('attachment://qrcode.png');
                    await channel.send({ embeds: [embed], files: [file] });
                }
            } catch (err) { console.error('QR Error:', err); }
        }

        // ניהול חיבור וניתוק
        if (connection === 'close') {
            isConnected = false;
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect || statusCode === 401) { 
                if (retryCount < 5) {
                    log(`[WhatsApp] 🔄 Reconnecting... (${retryCount + 1}/5)`);
                    retryCount++;
                    setTimeout(() => connectToWhatsApp(discordClient), 3000); 
                } else {
                    log('[WhatsApp] 🛑 Failed to reconnect.');
                }
            } else {
                connectToWhatsApp(discordClient); 
            }
        } else if (connection === 'open') {
            isConnected = true;
            retryCount = 0; 
            log('[WhatsApp] ✅ Connected!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // טיפול בהודעות נכנסות
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; 

        // דיבאג שקט כדי לדעת שההודעה התקבלה
        // console.log(`[WA DEBUG] Raw message received from: ${msg.key.remoteJid}`);

        // חילוץ הטקסט (כולל תיקון הודעות נעלמות)
        const text = getMessageContent(msg);
        
        if (!text) return; // אם אין טקסט (למשל סתם תמונה בלי כיתוב), מתעלמים

        const senderJid = msg.key.remoteJid;

        // 1. קודם בודקים מדיה (סאונד/סטיקרים)
        const mediaHandled = await handleMedia(sock, senderJid, text);
        if (mediaHandled) return; // אם שלחנו סטיקר, לא שולחים גם תשובה חכמה

        // 2. אם לא הייתה מדיה, מעבירים למוח של שמעון
        await handleMessageLogic(sock, msg, text);
    });
}

module.exports = { connectToWhatsApp, sendToMainGroup };