// 📁 handlers/whatsappHandler.js
const { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, EmbedBuilder, Collection } = require('discord.js');
const { log } = require('../utils/logger'); 
const { smartRespond } = require('./smartChat');

const AUTH_DIR = path.join(__dirname, '..', 'wa_auth_info');
if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR);
}

const STAFF_CHANNEL_ID = '881445829100060723'; 

let sock;
let isConnected = false; // ✅ דגל למניעת שליחת QR כשאנחנו כבר מחוברים

async function connectToWhatsApp(discordClient) {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
        printQRInTerminal: false, // ✅ ביטלנו את ההדפסה המלוכלכת בטרמינל
        auth: state,
        browser: ["Shimon Bot", "Chrome", "1.0.0"],
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // אם אנחנו כבר מחוברים, תתעלם מ-QR שקופצים בטעות
        if (isConnected && qr) return;

        if (qr) {
            log('[WhatsApp] 📸 QR Code חדש נוצר (ממתין לסריקה)...');
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
            isConnected = false; // ✅ עדכון סטטוס
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                log('[WhatsApp] 🔄 מנסה להתחבר מחדש...');
                connectToWhatsApp(discordClient);
            } else {
                log('[WhatsApp] 🛑 המשתמש התנתק יזום. נדרשת סריקה מחדש.');
            }
        } else if (connection === 'open') {
            isConnected = true; // ✅ אנחנו מחוברים!
            log('[WhatsApp] ✅ שמעון מחובר ומסונכרן!');
            
            // הודעה לדיסקורד רק בפעם הראשונה
            const channel = await discordClient.channels.fetch(STAFF_CHANNEL_ID);
            if (channel) channel.send('✅ **שמעון מחובר לוואטסאפ!** המוח חובר בהצלחה.');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // --- טיפול בהודעות ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return; 

        const senderJid = msg.key.remoteJid; 
        const senderName = msg.pushName || senderJid.split('@')[0];
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!text) return;

        // בדיקה אם ההודעה מכילה "שמעון"
        const isTargetingBot = text.toLowerCase().includes('שמעון') || text.toLowerCase().includes('shimon');

        if (isTargetingBot) {
            log(`[WhatsApp] 💬 הודעה מ-${senderName}: ${text}`);

            await sock.sendPresenceUpdate('composing', senderJid);
            await delay(1500); 

            // יצירת אובייקט הודעה מדומה ל-SmartChat
            const fakeDiscordMessage = {
                content: text,
                author: { 
                    id: senderJid, 
                    username: senderName,
                    bot: false 
                },
                member: {
                    displayName: senderName,
                    permissions: { has: () => false },
                    roles: { cache: new Collection() }
                },
                channel: {
                    id: 'whatsapp_dm',
                    messages: { fetch: async () => new Collection() },
                    sendTyping: async () => {} 
                },
                attachments: new Collection(), 
                mentions: { has: () => true }, 
                
                reply: async (response) => {
                    const replyText = typeof response === 'string' ? response : response.content;
                    await sock.sendMessage(senderJid, { text: replyText });
                    await sock.sendPresenceUpdate('paused', senderJid);
                }
            };

            try {
                await smartRespond(fakeDiscordMessage, true);
            } catch (error) {
                console.error('WhatsApp SmartChat Error:', error);
            }
        }
    });
}

module.exports = { connectToWhatsApp };