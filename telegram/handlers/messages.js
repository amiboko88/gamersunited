const xpManager = require('../../handlers/economy/xpManager');
const intelManager = require('../../handlers/intel/manager'); // 🕵️ Intel System
const brain = require('../../handlers/ai/brain');
const scanner = require('../utils/scanner');
const voiceManager = require('../../handlers/ai/voice');
const { InputFile } = require("grammy");
const fs = require('fs');
const path = require('path');
const https = require('https');

// פונקציית עזר להורדת קובץ
async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
}

module.exports = (bot) => {

    // --- 🎤 טיפול בהודעות קוליות ---
    bot.on(["message:voice", "message:audio"], async (ctx) => {
        const telegramId = ctx.from.id.toString();

        try {
            await ctx.replyWithChatAction("record_voice"); // שמעון "מקליט" (חושב)

            // 1. הורדת הקובץ
            const fileId = ctx.message.voice ? ctx.message.voice.file_id : ctx.message.audio.file_id;
            const file = await ctx.api.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;

            // נתיב זמני
            const tempPath = path.join(__dirname, `../../temp/${fileId}.ogg`);
            // וודא שתיקיית temp קיימת
            if (!fs.existsSync(path.dirname(tempPath))) fs.mkdirSync(path.dirname(tempPath), { recursive: true });

            await downloadFile(fileUrl, tempPath);

            // 2. המרה לטקסט (Whisper)
            const text = await voiceManager.transcribe(tempPath);
            fs.unlink(tempPath, () => { }); // ניקוי

            if (!text) {
                return ctx.reply("🙉 לא הצלחתי לשמוע אותך טוב. נסה שוב.");
            }

            // 2.5 בדיקת קישור משתמש (כמו בהודעות טקסט)
            const { getUserRef } = require('../../utils/userUtils');
            const userRef = await getUserRef(telegramId, 'telegram');
            const resolvedId = userRef.id;
            const isLinked = resolvedId !== telegramId;
            const targetId = isLinked ? resolvedId : telegramId;

            // 3. שליחה למוח וקבלת תשובה (עם דילוג על שמירה אם לא מקושר)
            // signature: ask(userId, platform, query, isAdmin, image, chatId, skipPersistence)
            const responseText = await brain.ask(targetId, 'telegram', text, false, null, null, !isLinked);

            if (responseText) {
                // 4. המרה חזרה לקול (ElevenLabs) - תמיד עונים בקול להודעה קולית
                await ctx.replyWithChatAction("record_voice");
                const audioBuffer = await voiceManager.speak(responseText);

                if (audioBuffer) {
                    await ctx.replyWithVoice(new InputFile(audioBuffer), {
                        caption: `🗣️ תגובה ל: "${text}"`,
                        reply_to_message_id: ctx.message.message_id
                    });
                } else {
                    // Fallback לטקסט אם הדיבור נכשל
                    await ctx.reply(responseText, { reply_to_message_id: ctx.message.message_id });
                }
            }

            // צבירת XP גם על קול
            xpManager.handleXP(telegramId, 'telegram', "VOICE_MESSAGE", ctx, null);

        } catch (error) {
            console.error("❌ Voice Error:", error);
            ctx.reply("תקלה במערכת הקולית.");
        }
    });

    // --- 📷 טיפול בתמונות (סריקת נתונים) ---
    bot.on("message:photo", async (ctx) => {
        const telegramId = ctx.from.id.toString();
        const text = ctx.message.caption || "ניתוח תמונה";

        try {
            await ctx.replyWithChatAction("upload_photo"); // חיווי

            // 1. קבלת התמונה האיכותית ביותר
            const photos = ctx.message.photo;
            const fileId = photos[photos.length - 1].file_id;
            const file = await ctx.api.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;

            // 2. הורדה לבאפר
            const response = await fetch(fileUrl);
            const arrayBuffer = await response.arrayBuffer();
            const imageBuffer = Buffer.from(arrayBuffer);

            // 3. קישור משתמש
            const { getUserRef } = require('../../utils/userUtils');
            const userRef = await getUserRef(telegramId, 'telegram');
            const resolvedId = userRef.id;
            const isLinked = resolvedId !== telegramId;
            const targetId = isLinked ? resolvedId : telegramId;

            // 4. שליחה למוח עם התמונה
            // אם המוח מזהה scoreboard, הוא יפעיל את cod_stats tool
            const aiResponse = await brain.ask(
                targetId,
                'telegram',
                text,
                false,
                imageBuffer, // ✅ העברת תמונה
                null,
                !isLinked // skipPersistence
            );

            if (aiResponse) {
                await ctx.reply(aiResponse, { reply_to_message_id: ctx.message.message_id });
            }

        } catch (e) {
            console.error("❌ Photo Error:", e);
            ctx.reply("תקלה בעיבוד התמונה.");
        }
    });

    // --- 💬 טיפול בהודעות טקסט ---
    bot.on("message:text", async (ctx) => {
        const text = ctx.message.text;
        const telegramId = ctx.from.id.toString();

        // 1. בדיקת תהליך זרימה (Flow) - סנכרון וכו'
        const flowHandler = require('./flow');
        const handled = await flowHandler.handleMessage(ctx);
        if (handled) return; // אם טופל ע"י הפלואו, נעצור כאן

        // 🧠 Auto-Learn Group ID (Self-Healing)
        // אם ההודעה מגיעה מהקבוצה הראשית, נשמור את ה-ID שלה לעתיד.
        if ((ctx.chat.type === 'supergroup' || ctx.chat.type === 'group') &&
            ctx.chat.title && ctx.chat.title.toLowerCase().includes('gamers united')) {

            // שמירה אסינכרונית בלי לעצור את הזרם
            const db = require('../../utils/firebase');
            db.collection('system_metadata').doc('config').set({
                telegram_main_group: ctx.chat.id.toString()
            }, { merge: true }).catch(err => console.error('Failed to save TG ID:', err));
        }

        // 🕵️ בדיקה: האם זו הודעה מועברת בפרטי? (Manual Scan)
        if (ctx.chat.type === 'private' && (ctx.message.forward_date || ctx.message.forward_from)) {
            if (ctx.message.forward_from) {
                await ctx.reply(`🕵️ מבצע סריקה על המשתמש: ${ctx.message.forward_from.first_name}...`);

                // סריקת המשתמש המועבר
                const scanResult = await scanner.findBestMatch(
                    ctx.message.forward_from.username,
                    `${ctx.message.forward_from.first_name} ${ctx.message.forward_from.last_name || ''}`
                );

                // דיווח למנהל בפרטי
                let report = `📊 **תוצאות סריקה:**\n`;
                report += `👤 שם: ${ctx.message.forward_from.first_name}\n`;
                report += `🆔 ID: \`${ctx.message.forward_from.id}\`\n`;
                report += `🔗 התאמה לדיסקורד: **${scanResult.name || "אין"}**\n`;
                report += `🎯 ציון התאמה: ${Math.round(scanResult.confidence * 100)}%\n\n`;

                if (scanResult.confidence > 0.6) {
                    report += `💡 **המלצה:** כנס לדשבורד בדיסקורד לאשר את הקישור.`;
                } else {
                    report += `⚠️ לא נמצאה התאמה טובה.`;
                }

                await ctx.reply(report, { parse_mode: "Markdown" });

                // הרצת הסריקה הרגילה כדי שזה יישמר ב-DB (Orphans)
                await scanner.scanUser(ctx.message.forward_from);
                return; // עוצרים כאן, לא שולחים ל-AI
            } else {
                await ctx.reply("❌ לא ניתן לסרוק משתמש זה (פרופיל מוסתר).");
                return;
            }
        }

        try {
            // 0. סריקה שקטה
            scanner.scanMessage(ctx).catch(err => console.error('[Scanner Error]', err));

            // ✅ בדיקת קישור משתמש (מונע יצירת מסמכי זבל ב-DB)
            const { getUserRef } = require('../../utils/userUtils');
            const userRef = await getUserRef(telegramId, 'telegram');
            const resolvedId = userRef.id;
            const isLinked = resolvedId !== telegramId; // אם ה-ID שונה, סימן שנמצא קישור לדיסקורד

            // 1. צבירת XP (רק למקושרים!)
            if (isLinked) {
                xpManager.handleXP(resolvedId, 'telegram', text, ctx, (msg) => ctx.reply(msg));
            }

            // 2. מוח (AI)
            const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
            const hasTrigger = text.includes("שמעון") || text.includes("שימי");

            if (isReplyToBot || hasTrigger) {
                // 🛑 Shabbat Check
                const shabbatManager = require('../../handlers/community/shabbat');
                if (shabbatManager.isShabbat()) {
                    await ctx.reply("שבת שלום! אני נח עכשיו, תחזור אחר כך. 🕯️🍷", { reply_to_message_id: ctx.message.message_id });
                    return;
                }

                await ctx.replyWithChatAction("typing");

                // שימוש ב-ID המקושר לזיכרון, או ב-TG ID זמני (אבל בלי לשמור ל-DB אם המוח חכם)
                const targetId = isLinked ? resolvedId : telegramId;

                // 🕵️ INTEL INTERCEPT
                try {
                    const intelResponse = await intelManager.handleNaturalQuery(text);
                    if (intelResponse) {
                        const txt = typeof intelResponse === 'string' ? intelResponse : intelResponse.text;

                        if (typeof intelResponse === 'object' && intelResponse.image) {
                            await ctx.replyWithPhoto(intelResponse.image, {
                                caption: txt + `\n\n📌 **Code:** <code>${intelResponse.code}</code>`,
                                parse_mode: "HTML"
                            });
                        } else {
                            await ctx.reply(txt, { parse_mode: "Markdown" });
                        }
                        return; // Stop here
                    }
                } catch (e) {
                    console.error('Intel Error:', e);
                }

                // ארגומנט אחרון: skipPersistence (true אם לא מקושר)
                const response = await brain.ask(targetId, 'telegram', text, false, null, null, !isLinked);

                if (response) {
                    // בדיקה אם המוח החליט "לצעוק" (Voice Mode)
                    if (response.startsWith('[VOICE]')) {
                        await ctx.replyWithChatAction("record_voice");
                        const audioBuffer = await voiceManager.speak(response);
                        if (audioBuffer) {
                            await ctx.replyWithVoice(new InputFile(audioBuffer), { reply_to_message_id: ctx.message.message_id });
                        } else {
                            await ctx.reply(response.replace('[VOICE]', ''), { reply_to_message_id: ctx.message.message_id });
                        }
                    } else {
                        await ctx.reply(response, { reply_to_message_id: ctx.message.message_id });
                    }
                }
            }
        } catch (error) {
            console.error('❌ [TELEGRAM ERROR]', error);
        }
    });

};
