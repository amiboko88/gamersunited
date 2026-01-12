// 📁 handlers/ai/tools/dj.js
const audioScanner = require('../../audio/scanner');
const graphics = require('../../graphics/index'); // ✅ תיקון נתיב
const fs = require('fs');

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "dj_control",
            description: "Manage WhatsApp Audio. Play song (sends file) or List songs.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["play", "list"] },
                    song_name: { type: "string", description: "Name of the song." }
                },
                required: ["action"]
            }
        }
    },

    async execute(args, userId, chatId) {
        const { getWhatsAppSock } = require('../../../whatsapp/index');
        const sock = getWhatsAppSock();
        
        const targetJid = chatId || process.env.WHATSAPP_MAIN_GROUP_ID;

        if (!sock) return "שמעון לא מחובר לוואטסאפ.";

        // --- רשימה ---
        if (args.action === 'list') {
            const tracks = audioScanner.getTracks();
            if (tracks.length === 0) return "אין שירים.";

            // ✅ קריאה נכונה לרינדור החדש
            const imageBuffer = await graphics.playlist.generateImage(tracks);
            
            if (imageBuffer) {
                await sock.sendMessage(targetJid, { 
                    image: imageBuffer, 
                    caption: `🎧 **הפלייליסט** (${tracks.length} שירים)`
                });
                return "שלחתי את הרשימה.";
            }
            return "רשימה: " + tracks.map(t => t.name).join(', ');
        }

        // --- ניגון ---
        if (args.action === 'play') {
            const tracks = audioScanner.getTracks();
            const searchTerm = (args.song_name || "").toLowerCase().trim();

            const found = tracks.find(t => 
                t.name.toLowerCase().includes(searchTerm) || 
                t.filename.toLowerCase().includes(searchTerm)
            );
            
            if (!found) return `לא מצאתי את "${args.song_name}".`;

            try {
                const audioBuffer = fs.readFileSync(found.fullPath);
                await sock.sendMessage(targetJid, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mpeg', 
                    ptt: true 
                });
                return `✅ שלחתי את **${found.name}**.`;
            } catch (err) {
                console.error("Audio Send Error:", err);
                return "שגיאה בשליחת הקובץ.";
            }
        }
    }
};