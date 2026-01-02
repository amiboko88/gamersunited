const { makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { useFirestoreAuthState } = require('./auth');
const { handleMedia } = require('./media');
const { handleMessageLogic } = require('./logic/core');
const qrcode = require('qrcode');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { log } = require('../utils/logger'); 
const fs = require('fs'); 

// ייבוא ה-Cron החדש
const { startWhatsAppCron } = require('./cron');

const STAFF_CHANNEL_ID = '881445829100060723'; 
let sock;
let isConnected = false;
let retryCount = 0;
// משתנה למניעת הפעלה כפולה של מתזמנים
let isCronStarted = false; 

function getMessageContent(msg) {
    if (!msg.message) return null;
    const content = msg.message.ephemeralMessage?.message || msg.message;
    return content.conversation || 
           content.extendedTextMessage?.text || 
           content.imageMessage?.caption || 
           content.videoMessage?.caption ||
           null;
}

async function sendToMainGroup(text, mentions = [], mediaPath = null) {
    const mainGroupId = process.env.WHATSAPP_MAIN_GROUP_ID; 

    if (!sock || !isConnected) {
        console.log('⚠️ WhatsApp disconnected. Cannot send message.');
        return;
    }
    if (!mainGroupId) return;
    
    try {
        const mentionJids = mentions.map(phone => 
            phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`
        );

        if (mediaPath && fs.existsSync(mediaPath)) {
            const buffer = fs.readFileSync(mediaPath);
            await sock.sendMessage(mainGroupId, { 
                image: buffer, 
                caption: text, 
                mentions: mentionJids 
            });
        } else {
            await sock.sendMessage(mainGroupId, { text: text, mentions: mentionJids });
        }
    } catch (err) { console.error('Send Error:', err.message); }
}

async function connectToWhatsApp(discordClient) {
    // שימוש ב-Auth שלך (Firestore) - שמרנו על זה!
    const { state, saveCreds } = await useFirestoreAuthState();

    sock = makeWASocket({
        printQRInTerminal: false,
        auth: state,
        browser: ["Shimon Bot", "Chrome", "1.0.0"],
        syncFullHistory: false,
        logger: require('pino')({ level: 'silent' }),
        connectTimeoutMs: 60000, 
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (isConnected && qr) return;

        // לוגיקת QR לדיסקורד - שמרנו על זה!
        if (qr) {
            log('[WhatsApp] 📸 New QR');
            try {
                const qrBuffer = await qrcode.toBuffer(qr);
                const file = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });
                const channel = await discordClient.channels.fetch(STAFF_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('סרוק לחיבור שמעון')
                        .setImage('attachment://qrcode.png');
                    await channel.send({ embeds: [embed], files: [file] });
                }
            } catch (err) { console.error('QR Error:', err); }
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            log(`[WhatsApp] ❌ Connection closed (${statusCode}), reconnecting: ${shouldReconnect}`);

            if (shouldReconnect || statusCode === 401) { 
                if (retryCount < 5) {
                    retryCount++;
                    // מעבירים את discordClient גם בחיבור מחדש
                    setTimeout(() => connectToWhatsApp(discordClient), 3000); 
                }
            } else {
                connectToWhatsApp(discordClient); 
            }
} else if (connection === 'open') {
            isConnected = true;
            retryCount = 0; 
            log('[WhatsApp] ✅ Connected!');
            
            // ✅ התיקון: מעבירים את discordClient וגם את sendToMainGroup
            if (!isCronStarted && discordClient) {
                log('[WhatsApp] ⏳ Starting Cron jobs with Discord link...');
                // שינינו את השורה הזו:
                startWhatsAppCron(discordClient, sendToMainGroup); 
                isCronStarted = true;
            } else if (!discordClient) {
                log('[WhatsApp] ⚠️ Warning: Discord Client missing in connectToWhatsApp!');
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // 🔥 תוספת: דחיית שיחות (כדי שלא יציקו לבוט)
    sock.ev.on('call', async (node) => {
        const { id, from, status } = node[0];
        if (status === 'offer') {
            await sock.rejectCall(id, from);
            // לוג שקט, לא חובה
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; 

        const text = getMessageContent(msg);
        const senderJid = msg.key.remoteJid;

        // ה-handler שלך למדיה - שמרנו עליו!
        const mediaHandled = await handleMedia(sock, senderJid, text || "");
        if (mediaHandled) return; 

        await handleMessageLogic(sock, msg, text || "");
    });
}

module.exports = { connectToWhatsApp, sendToMainGroup };