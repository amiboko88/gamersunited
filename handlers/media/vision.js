// 📁 handlers/media/vision.js
const { OpenAI } = require('openai');
const { downloadMediaMessage } = require('@whiskeysockets/baileys'); 
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * מנתח תמונה באמצעות GPT-4o
 */
async function analyzeImage(imageBuffer, systemPrompt) {
    try {
        const base64Image = imageBuffer.toString('base64');
        const response = await openai.chat.completions.create({
            model: "gpt-4o", 
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: [{ type: "image_url", image_url: { "url": `data:image/jpeg;base64,${base64Image}` } }] }
            ],
            max_tokens: 300
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("Vision Error:", error);
        return null;
    }
}

/**
 * מוריד תמונה מוואטסאפ (Helper Wrapper)
 */
async function downloadWhatsAppImage(msg, sock) {
    if (!msg.message.imageMessage) return null;
    return await downloadMediaMessage(
        msg, 'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage }
    );
}

module.exports = { analyzeImage, downloadWhatsAppImage };