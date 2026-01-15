const xpManager = require('../../handlers/economy/xpManager');
const brain = require('../../handlers/ai/brain');
const scanner = require('../utils/scanner');
const voiceManager = require('../../handlers/ai/voice'); // ✅ ייבוא מנוע הקול
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

            // עדכון המשתמש ששמענו אותו
            // ctx.reply(`👂 שמעתי: "${text}"`, { reply_to_message_id: ctx.message.message_id });

            // 3. שליחה למוח וקבלת תשובה
            const responseText = await brain.ask(telegramId, 'telegram', text);

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

    // --- 💬 טיפול בהודעות טקסט ---
    bot.on("message:text", async (ctx) => {
        const text = ctx.message.text;
        const telegramId = ctx.from.id.toString();

        try {
            // 0. סריקה שקטה
            scanner.scanMessage(ctx).catch(err => console.error('[Scanner Error]', err));

            // 1. צבירת XP
            xpManager.handleXP(telegramId, 'telegram', text, ctx, (msg) => ctx.reply(msg));

            // 2. מוח (AI)
            const isReplyToBot = ctx.message.reply_to_message?.from?.id === ctx.me.id;
            const hasTrigger = text.includes("שמעון") || text.includes("שימי");

            if (isReplyToBot || hasTrigger) {
                await ctx.replyWithChatAction("typing");
                const response = await brain.ask(telegramId, 'telegram', text);

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
