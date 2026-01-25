const db = require('../../utils/firebase');
const { log } = require('../../utils/logger');
const graphics = require('../graphics/campaignCard');
const { openai } = require('../ai/brain'); // Reuse logic but custom call
const { getWhatsAppSock, sendToMainGroup } = require('../../whatsapp/index');

const CAMPAIGN_GROUP_LINK = "https://chat.whatsapp.com/JqGyGhH5WBBHaKtwbm61pt";

// 📝 MAPPING: User ID -> Phone Number (International format)
const TARGETS = {
    '910529816552407080': '972528196044', // Mordechai
    '768978918911770655': '972543310713', // Calimero
    '789180746367238220': '972526196135', // Tal Ayash
    '715309759389237300': '972502055458', // Rotem
    '587981526281486338': '972528561400', // Siak
    '798277402018971708': '972509305159', // Nati
    '321892088100814858': '972503056714'  // Vitaly
};

class DesertersCampaign {

    /**
     * TRIGGERED BY ADMIN COMMAND: "תפעיל קמפיין נוטשים"
     * Iterates the target list, links phones to DB, and sends invites.
     */
    async runFullCampaign(sock, adminJid) {
        log('🚀 [Campaign] Starting Full Deserters Campaign...');
        await sock.sendMessage(adminJid, { text: `🚀 מתחיל קמפיין ל-${Object.keys(TARGETS).length} נוטשים...` });

        for (const [id, phone] of Object.entries(TARGETS)) {
            try {
                // 1. DB Update (Link Phone if missing)
                const docRef = db.collection('users').doc(id);
                await docRef.set({
                    identity: { whatsappPhone: phone },
                    meta: {
                        whatsappPhone: phone,
                        isExWhatsApp: true,
                        crmTag: 'EX_WHATSAPP'
                    }
                }, { merge: true });

                // 2. Launch Invite
                const result = await this.launchInvite(id, phone);
                await sock.sendMessage(adminJid, { text: result });

            } catch (err) {
                log(`💥 Error processing ${id}: ${err.message}`);
                await sock.sendMessage(adminJid, { text: `❌ שגיאה עם ${id}: ${err.message}` });
            }

            // Wait 5 seconds between sends
            await new Promise(r => setTimeout(r, 5000));
        }

        await sock.sendMessage(adminJid, { text: `🏁 הקמפיין הסתיים.` });
    }

    /**
     * Start the campaign for a specific user ID linked to a phone number.
     */
    async launchInvite(userId, phone) {
        try {
            const sock = getWhatsAppSock();
            if (!sock) throw new Error("WhatsApp socket dead");

            const docRef = db.collection('users').doc(userId);
            const doc = await docRef.get();
            if (!doc.exists) return "User not found";

            const data = doc.data();

            // 1. Update State
            await docRef.set({
                meta: {
                    campaignStatus: 'SENT',
                    campaignStartTime: new Date().toISOString(),
                    whatsappPhone: phone // Link it now!
                },
                identity: { whatsappPhone: phone } // Ensure identity has it too
            }, { merge: true });

            // 2. Generate Card
            const cardData = {
                name: data.identity?.displayName || 'Unknown',
                avatar: data.identity?.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png',
                stats: { voiceHours: ((data.stats?.voiceMinutes || 0) / 60).toFixed(1) },
                level: data.economy?.level || 1
            };
            const imageBuffer = await graphics.generateInviteCard(cardData);

            // 3. Send Message
            const jid = `${phone}@s.whatsapp.net`;
            const caption = `היי ${cardData.name}, שמעון כאן.\nעבר הרבה זמן. הנתונים שלך מעלים אבק, אבל אנחנו זוכרים.\n\nהאם תרצה לחזור הביתה?`;

            await sock.sendMessage(jid, {
                image: imageBuffer,
                caption: caption
            });

            log(`📢 [Campaign] Invite sent to ${cardData.name} (${phone})`);
            return `✅ Invite sent to ${cardData.name}`;

        } catch (e) {
            log(`❌ [Campaign] Launch Error: ${e.message}`);
            return `Failed: ${e.message}`;
        }
    }

    /**
     * Intercept and handle replies from campaign targets.
     */
    async handleReply(userId, phone, text, sock, msg) {
        const jid = `${phone}@s.whatsapp.net`;
        const docRef = db.collection('users').doc(userId);

        // 1. Log the User's reply
        await docRef.collection('campaign_logs').add({
            sender: 'user',
            text: text,
            timestamp: new Date()
        });

        // 2. AI Analysis & Response Generation
        // We want a specialized persona here.
        const systemPrompt = `
        You are Shimon, the "Don" of the Gamers United group.
        You invited an old member ("${userId}") to return.
        They just replied: "${text}"

        TASK: Analyze sentiment and reply.
        
        SCENARIO A: HOSTILE / RUDE / REFUSAL ("Fuck off", "No thanks", "Leave me alone")
        - ACTION: Atttack hard. Use insults. Voice message style text.
        - TONE: Brutal, Dominant, Nasty.
        - CONTENT: "You ugly piece of trash, thought you had teeth left?", "Stay in the sewer."
        
        SCENARIO B: POLITE REFUSAL ("Not now", "Maybe later")
        - ACTION: Passive Aggressive.
        - TONE: Condescending.
        - CONTENT: "Okay little boy. Remember who made you."

        SCENARIO C: POSITIVE / INTERESTED ("Yes", "Sure", "Send link")
        - ACTION: Welcome them back warmly (but strictly).
        - TONE: "Good choice."
        - SPECIAL: You MUST include the link: ${CAMPAIGN_GROUP_LINK}

        SCENARIO D: CONFUSION / SUSPICION / FEAR ("Who is this?", "How did you get my number?", "Spam")
        - ACTION: DE-ESCALATE IMMEDIATELY. BE FRIENDLY.
        - TONE: "Brotherly", "Chill", "Explanatory".
        - CONTENT: "Relax brother, it's Shimon from Gamers United (Ami's group). Just wanted to say hi."
        - CRITICAL: DO NOT be toxic here. We don't want to be reported.

        OUTPUT FORMAT JSON:
        {
            "sentiment": "HOSTILE" | "NEUTRAL" | "POSITIVE" | "CONFUSED",
            "replyText": "Your Hebrew response here",
            "shouldVoice": boolean (true for Hostile/Neutral to roast them, FALSE for Confused/Safety)
        }
        `;

        const { OpenAI } = require('openai');
        const runner = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const completion = await runner.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }],
            response_format: { type: "json_object" }
        });

        const aiResult = JSON.parse(completion.choices[0].message.content);

        // 3. Send AI Reply
        await sock.sendMessage(jid, { text: aiResult.replyText }, { quoted: msg });

        // LOG AI REPLY
        await docRef.collection('campaign_logs').add({
            sender: 'ai',
            text: aiResult.replyText,
            timestamp: new Date(),
            sentiment: aiResult.sentiment
        });

        // 4. Voice Roast (Optional - Extra Toxic)
        if (aiResult.shouldVoice) {
            const voiceHandler = require('../ai/voice');
            const audio = await voiceHandler.speak(aiResult.replyText); // Uses ElevenLabs
            if (audio) {
                await sock.sendMessage(jid, { audio: audio, mimetype: 'audio/mp4', ptt: true });
            }
        }

        // 5. Update Status
        let newStatus = 'RESPONDED_NEUTRAL';
        if (aiResult.sentiment === 'HOSTILE') newStatus = 'RESPONDED_HOSTILE';
        if (aiResult.sentiment === 'POSITIVE') newStatus = 'RESPONDED_GOOD';

        await docRef.set({
            meta: { campaignStatus: newStatus }
        }, { merge: true });

        // 6. Notify Admin (Ami) via Private WhatsApp if Hostile or Final
        if (newStatus === 'RESPONDED_HOSTILE' || newStatus === 'RESPONDED_GOOD') {
            // Find Ami's number or Admin number
            // Hardcoding Ami's number for direct notification logic or send to Admin group
            // For now, let's log it.
            log(`🔔 [Campaign] User ${userId} responded: ${aiResult.sentiment}`);
        }
    }
}

module.exports = new DesertersCampaign();
