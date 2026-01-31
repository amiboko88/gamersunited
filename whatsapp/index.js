const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino'); // Logger
const { useFirestoreAuthState } = require('./auth');
const coreLogic = require('./logic/core');
const { ensureUserExists } = require('../utils/userUtils');
const { log } = require('../utils/logger');
const whatsappScout = require('./utils/scout');
const matchmaker = require('../handlers/matchmaker');
const store = require('./store');

const { setSocket, getSocket } = require('./socket');
const graphicsWelcome = require('../handlers/graphics/welcomeCard'); // 🎨 Welcome Graphics

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
            logger: pino({ level: 'fatal' }),
            auth: state,
            msgRetryCounterCache,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0, // Disable query timeout to prevent 503 during sync
            keepAliveIntervalMs: 30000, // Balanced heartbeat
            emitOwnEvents: false,
            browser: ["Shimon Bot", "Chrome", "1.0.0"],
            syncFullHistory: false, // 🚀 Faster sync, less 428 errors
            markOnlineOnConnect: true
        });

        setSocket(sock); // ✅ שומרים במודול החיצוני

        // Bind Store to Socket Events
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

                        // 🧟 Resurrection Protocol: Check for missed insults
                        const resurrection = require('../handlers/ai/resurrection');
                        resurrection.execute(sock, MAIN_GROUP_ID);

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
                const realPhone = getRealPhoneNumber(participant) || participant.split('@')[0];

                if (action === 'add') {
                    console.log(`👋 [WhatsApp] משתמש הצטרף: ${realPhone}`);

                    // 1. Ensure User in DB
                    await ensureUserExists(realPhone, "New Gamer", "whatsapp");

                    // 2. Fetch Profile Pic (Smart Fallback Strategy 🧠)
                    let pfpUrl = undefined;
                    try {
                        // A. Try WhatsApp (Most relevant)
                        pfpUrl = await sock.profilePictureUrl(participant, 'image');
                    } catch (e) {
                        // Privacy settings hidden? Ignore.
                    }

                    if (!pfpUrl) {
                        // B. Try DB (Linked Discord Avatar)
                        try {
                            const db = require('../utils/firebase');
                            const userRef = await ensureUserExists(realPhone, "New Gamer", "whatsapp");
                            const userDoc = await userRef.get();

                            // Check for synced Discord avatar
                            pfpUrl = userDoc.data()?.identity?.avatar ||
                                userDoc.data()?.identity?.avatar_discord;

                            if (pfpUrl) console.log(`✅ [Welcome] Using Discord Avatar for ${realPhone}`);
                        } catch (dbErr) { }
                    }

                    // 3. Generate Card
                    try {
                        const cardBuffer = await graphicsWelcome.generateWelcomeCard(realPhone, pfpUrl);
                        const caption = `👋 ברוך הבא לקבוצה @${realPhone}!\nתציג את עצמך שנכיר.`;

                        await sock.sendMessage(MAIN_GROUP_ID, {
                            image: cardBuffer,
                            caption: caption,
                            mentions: [participant]
                        });
                    } catch (err) {
                        console.error('❌ Failed to send welcome card:', err);
                        // Fallback to text
                        await sock.sendMessage(MAIN_GROUP_ID, { text: `👋 ברוך הבא @${realPhone}!`, mentions: [participant] });
                    }
                }
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message || msg.key.fromMe) return;
                if (msg.key.remoteJid === 'status@broadcast') return;

                // 🕯️ Shabbat Observance Check
                const shabbatManager = require('../handlers/community/shabbat');
                if (shabbatManager.isShabbat && shabbatManager.isShabbat()) {
                    // console.log('😴 [Shabbat] Shimon is resting.');
                    return;
                }

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
                // 3. משתמש מאומת - ממשיכים

                // --- 🕯️ Shabbat Auto-Reaction (Prayer Hands) ---
                // If user replies to a Shabbat/Havdalah card, react with 🙏
                const quotedContext = msg.message?.extendedTextMessage?.contextInfo;
                if (quotedContext && quotedContext.quotedMessage) {
                    const quotedContent = quotedContext.quotedMessage.conversation ||
                        quotedContext.quotedMessage.extendedTextMessage?.text ||
                        quotedContext.quotedMessage.imageMessage?.caption || "";

                    // Check if quoted message is a Shabbat/Havdalah card
                    if (quotedContent.includes('זמני כניסת') || quotedContent.includes('זמני יציאת') ||
                        quotedContent.includes('שבת שלום') || quotedContent.includes('שבוע טוב')) {

                        // React with Prayer Hands
                        await sock.sendMessage(msg.key.remoteJid, {
                            react: { text: '🙏', key: msg.key }
                        });
                        console.log(`🙏 [WhatsApp] Auto-Reacted to Shabbat Reply from ${pushName}`);
                    }
                }

                // --- ☠️ Kill Switch Trigger (WhatsApp) ---
                const isQuote = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (isQuote && (text.includes('@שמעון') || text.includes('שמעון'))) {
                    const db = require('../utils/firebase');
                    const mvpDoc = await db.collection('system_metadata').doc('current_mvp').get();

                    if (mvpDoc.exists) {
                        const mvpId = mvpDoc.data().id; // מכיל את מספר הטלפון
                        const cleanSender = realSenderPhone.replace(/\D/g, '');
                        const cleanMvp = mvpId.replace(/\D/g, '');

                        if (cleanSender === cleanMvp) {
                            const targetId = msg.message.extendedTextMessage.contextInfo.participant;
                            if (targetId) {
                                const cleanTarget = getRealPhoneNumber(targetId) || targetId.replace(/\D/g, '');
                                console.log(`☠️ [WhatsApp] Kill Switch Triggered by MVP against ${cleanTarget}`);

                                const brain = require('../handlers/ai/brain');
                                const audioPath = await brain.executeKillSwitch(cleanTarget, 'whatsapp');

                                if (audioPath) {
                                    await sock.sendMessage(msg.key.remoteJid, {
                                        audio: { url: audioPath },
                                        mimetype: 'audio/mp4',
                                        ptt: true
                                    }, { quoted: msg });
                                    return;
                                }
                            }
                        }
                    }
                }

                if (coreLogic && coreLogic.handleMessageLogic) {
                    await coreLogic.handleMessageLogic(sock, msg, text, realSenderPhone);
                }

                // 👻 Ghost Protocol (Monitoring Hunt)
                try {
                    const ghostProtocol = require('../handlers/users/ghostProtocol');
                    // Pass the whole socket if needed, but the method mainly needs 'msg'
                    await ghostProtocol.onGroupMessage(msg);
                } catch (e) { /* Ignore non-critical errors */ }

            } catch (err) {
                console.error('❌ [WhatsApp Logic Error]:', err);
            }
        });

    } catch (error) {
        console.error('❌ [WhatsApp Fatal Error]:', error);
        setTimeout(connectToWhatsApp, 5000);
    }
}

async function sendToMainGroup(text, mentions = [], imageBuffer = null, tagAll = false) {
    const sock = getSocket();
    if (!sock || !MAIN_GROUP_ID) return;
    try {
        // Tag All Logic
        if (tagAll) {
            try {
                const groupMetadata = await sock.groupMetadata(MAIN_GROUP_ID);
                mentions = groupMetadata.participants.map(p => p.id);
                // Optional: Append hidden char or just use mentions array
                // If text doesn't contain the mentions, they might not highlight visually on some clients,
                // but usually passing the array is enough for notification.
            } catch (e) {
                console.error('❌ Failed to fetch group metadata for TagAll:', e.message);
            }
        }

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

async function sendDirectMessage(phone, text) {
    const sock = getSocket();
    if (!sock) {
        console.error('❌ [WhatsApp] Cannot send DM - Socket not connected');
        return;
    }
    try {
        const jid = `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text });
        console.log(`📩 [WhatsApp] DM sent to ${phone}`);
    } catch (err) {
        console.error(`❌ [WhatsApp DM Error] Failed to send to ${phone}:`, err.message);
    }
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

module.exports = { connectToWhatsApp, sendToMainGroup, sendDirectMessage, disconnectWhatsApp, getWhatsAppSock, getResolver };