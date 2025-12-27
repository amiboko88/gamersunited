// 📁 handlers/whatsappHandler.js
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { log } = require('../utils/logger'); 

// נתיב לשמירת ה-Session (פרטי החיבור)
const AUTH_DIR = path.join(__dirname, '..', 'wa_auth_info');
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR);
}

const STAFF_CHANNEL_ID = '881445829100060723'; // הערוץ אליו יישלח ה-QR

let sock;

async function connectToWhatsApp(discordClient) {
    // טעינת ה-Session מהדיסק
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
        printQRInTerminal: true, // מציג בלוגים של Railway
        auth: state,
        browser: ["Shimon Bot", "Chrome", "1.0.0"], // נראה כמו דפדפן כרום
        syncFullHistory: false // חוסך זיכרון, לא מוריד היסטוריה ישנה
    });

    // --- טיפול באירועי חיבור ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            log('[WhatsApp] 📸 QR Code חדש נוצר! שולח לדיסקורד...');
            try {
                // המרה לתמונה ושליחה לדיסקורד
                const qrBuffer = await qrcode.toBuffer(qr);
                const file = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });

                const channel = await discordClient.channels.fetch(STAFF_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('📱 נדרשת סריקה לחיבור וואטסאפ')
                        .setDescription('פתח וואטסאפ בטלפון -> הגדרות -> מכשירים מקושרים -> סרוק את הקוד.')
                        .setColor('#25D366') // ירוק וואטסאפ
                        .setImage('attachment://qrcode.png')
                        .setFooter({ text: 'הקוד מתרענן כל כמה שניות' });

                    await channel.send({ embeds: [embed], files: [file] });
                }
            } catch (err) {
                console.error('❌ שגיאה בשליחת QR לדיסקורד:', err);
            }
        }

        if (connection === 'close') {
            // טיפול בניתוקים (אוטומטי)
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            log(`[WhatsApp] ⚠️ החיבור נסגר. מנסה להתחבר מחדש? ${shouldReconnect}`);
            
            if (shouldReconnect) {
                connectToWhatsApp(discordClient);
            } else {
                log('[WhatsApp] 🛑 המשתמש התנתק יזום (Logged Out). נדרשת סריקה מחדש.');
                // במקרה כזה אפשר למחוק את התיקייה כדי לאפס
            }
        } else if (connection === 'open') {
            log('[WhatsApp] ✅ מחובר בהצלחה!');
            const channel = await discordClient.channels.fetch(STAFF_CHANNEL_ID);
            if (channel) channel.send('✅ **שמעון מחובר לוואטסאפ!** אפשר להתחיל לשגע אותו.');
        }
    });

    // שמירת אישורים בכל שינוי (חשוב!)
    sock.ev.on('creds.update', saveCreds);

    // --- טיפול בהודעות נכנסות ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; // מתעלם מהודעות שלי/מערכת

        // שליפת הטקסט (תומך בטקסט רגיל ובהודעות מצוטטות)
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const sender = msg.key.remoteJid; // המספר של השולח
        const senderNumber = sender.split('@')[0];

        if (!text) return;

        log(`[WhatsApp] 📩 הודעה מ-${senderNumber}: ${text}`);

        // --- דוגמה ללוגיקה של שמעון בוואטסאפ ---
        if (text.includes('שמעון')) {
            // כאן נחבר בעתיד את ה-SmartChat
            await sock.sendMessage(sender, { text: 'שמעתי את השם שלי? אני פה, אבל המוח שלי כרגע בדיסקורד.' });
        }
    });
}

module.exports = { connectToWhatsApp };