// 📁 handlers/whatsappHandler.js (שמעון החכם לוואטסאפ)
const { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, EmbedBuilder, Collection } = require('discord.js');
const { log } = require('../utils/logger'); 
const { smartRespond } = require('./smartChat'); // מייבאים את המוח

const AUTH_DIR = path.join(__dirname, '..', 'wa_auth_info');
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR);
}

const STAFF_CHANNEL_ID = '881445829100060723'; 

let sock;

async function connectToWhatsApp(discordClient) {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        browser: ["Shimon Bot", "Chrome", "1.0.0"],
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            log('[WhatsApp] 📸 QR Code חדש נוצר! שולח לדיסקורד...');
            try {
                const qrBuffer = await qrcode.toBuffer(qr);
                const file = new AttachmentBuilder(qrBuffer, { name: 'qrcode.png' });
                const channel = await discordClient.channels.fetch(STAFF_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('📱 נדרשת סריקה לחיבור וואטסאפ')
                        .setDescription('סרוק את הקוד דרך WhatsApp Business בטלפון שלך.')
                        .setColor('#25D366')
                        .setImage('attachment://qrcode.png');
                    await channel.send({ embeds: [embed], files: [file] });
                }
            } catch (err) {
                console.error('❌ שגיאה בשליחת QR:', err);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWhatsApp(discordClient);
            } else {
                log('[WhatsApp] 🛑 המשתמש התנתק יזום. נדרשת סריקה מחדש.');
            }
        } else if (connection === 'open') {
            log('[WhatsApp] ✅ שמעון מחובר ומסונכרן!');
            const channel = await discordClient.channels.fetch(STAFF_CHANNEL_ID);
            if (channel) channel.send('✅ **שמעון מחובר לוואטסאפ!** המוח חובר בהצלחה.');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // --- טיפול בהודעות חכם ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; 

        const senderJid = msg.key.remoteJid; 
        const senderName = msg.pushName || senderJid.split('@')[0]; // שם השולח או המספר שלו
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!text) return;

        // טריגר: אם המילה "שמעון" מופיעה (או שאתה רוצה שהוא יענה להכל בפרטי?)
        // כרגע מוגדר לענות רק אם קוראים לו בשם
        const isTargetingBot = text.toLowerCase().includes('שמעון') || text.toLowerCase().includes('shimon');

        if (isTargetingBot) {
            log(`[WhatsApp] 💬 הודעה מ-${senderName}: ${text}`);

            // 1. שליחת חיווי "מקליד..." בוואטסאפ
            await sock.sendPresenceUpdate('composing', senderJid);
            await delay(1500); // השהייה קטנה לאפקט ריאליסטי

            // 2. יצירת "הודעה מדומה" (Mock) שנראית כמו Discord Message
            // זה עובד על SmartChat ומגרום לו לחשוב שהוא בדיסקורד
            const fakeDiscordMessage = {
                content: text,
                author: { 
                    id: senderJid, // משתמש במספר הטלפון כ-ID ייחודי
                    username: senderName,
                    bot: false 
                },
                member: {
                    displayName: senderName,
                    permissions: { has: () => false }, // בוואטסאפ אין אדמינים כרגע
                    roles: { cache: new Collection() }
                },
                channel: {
                    id: 'whatsapp_dm',
                    messages: { 
                        // כרגע אין היסטוריה בוואטסאפ, מחזיר מערך ריק
                        fetch: async () => new Collection() 
                    },
                    sendTyping: async () => {} // כבר טיפלנו בזה למעלה
                },
                attachments: new Collection(), // תמיכה בתמונות תהיה בהמשך
                mentions: { has: () => true }, // כאילו תייגו אותו
                
                // הפונקציה הקריטית: איך שמעון עונה חזרה לוואטסאפ
                reply: async (response) => {
                    // SmartChat לפעמים מחזיר אובייקט או סטרינג
                    const replyText = typeof response === 'string' ? response : response.content;
                    
                    // שליחת התשובה לוואטסאפ
                    await sock.sendMessage(senderJid, { text: replyText });
                    
                    // מפסיק את ה"מקליד..."
                    await sock.sendPresenceUpdate('paused', senderJid);
                }
            };

            // 3. הפעלת המוח!
            try {
                // שולחים את ההודעה המדומה למוח של שמעון
                // פרמטר שני true = force (לעקוף מגבלות ערוצים כי זה וואטסאפ)
                await smartRespond(fakeDiscordMessage, true);
            } catch (error) {
                console.error('WhatsApp SmartChat Error:', error);
            }
        }
    });
}

module.exports = { connectToWhatsApp };