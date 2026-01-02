const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { OpenAI } = require('openai');
const { log } = require('../../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const verificationQueue = new Map();

function addClaimToQueue(senderId, damageAmount) {
    verificationQueue.set(senderId, { claimedDmg: damageAmount, timestamp: Date.now() });
}

// מחזיר את הניתוח (String) או null
async function analyzeImage(sock, msg, systemPrompt) {
    if (!msg.message.imageMessage) return null;

    try {
        const buffer = await downloadMediaMessage(
            msg, 'buffer', {}, { logger: console, reuploadRequest: sock.updateMediaMessage }
        );
        const base64Image = buffer.toString('base64');

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

function shouldCheckImage(senderId, caption) {
    const hasClaim = verificationQueue.has(senderId);
    if (hasClaim) {
        // מחיקת התביעה מהתור (חד פעמי)
        const claim = verificationQueue.get(senderId);
        verificationQueue.delete(senderId);
        return { check: true, claimData: claim };
    }
    return { check: caption.includes('לוח') || caption.includes('דמג') || caption.includes('Score'), claimData: null };
}

module.exports = { analyzeImage, addClaimToQueue, shouldCheckImage };