// 📁 handlers/ai/tools/dj.js
const audioScanner = require('../../audio/scanner');
const playlistRenderer = require('../../audio/render');
const fs = require('fs');

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "dj_control",
            description: "Manage WhatsApp Audio: List songs or Play song.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["play", "list"] },
                    // 👇 השינוי: הנחיה ברורה ל-AI לתרגם לאנגלית/שם קובץ
                    song_name: { 
                        type: "string", 
                        description: "The name of the song. If user writes in Hebrew, try to translate/transliterate to English matching potential filenames (e.g. 'קלי' -> 'kali')." 
                    }
                },
                required: ["action"]
            }
        }
    },

    async execute(args) {
        const { getWhatsAppSock } = require('../../../whatsapp/index');
        const sock = getWhatsAppSock();
        const mainGroupId = process.env.WHATSAPP_MAIN_GROUP_ID;

        if (!sock || !mainGroupId) {
            return "שמעון לא מחובר לוואטסאפ כרגע.";
        }

        // --- רשימה ---
        if (args.action === 'list') {
            const tracks = audioScanner.getTracks();
            if (tracks.length === 0) return "אין לי שירים בתיקייה.";

            const imageBuffer = await playlistRenderer.generatePlaylistImage(tracks);
            
            if (imageBuffer) {
                await sock.sendMessage(mainGroupId, { 
                    image: imageBuffer, 
                    caption: `🎧 **הפלייליסט של שמעון**\nסה"כ ${tracks.length} טראקים.\nתבחרו מה בא לכם.`
                });
                return "שלחתי תמונה.";
            }
            return "רשימה (טקסט): " + tracks.map(t => t.name).join(', ');
        }

        // --- ניגון ---
        if (args.action === 'play') {
            const tracks = audioScanner.getTracks();
            const searchTerm = (args.song_name || "").toLowerCase().trim(); // 👇 הופכים לאותיות קטנות

            // חיפוש חכם (Case Insensitive)
            const found = tracks.find(t => 
                t.name.toLowerCase().includes(searchTerm) || 
                t.filename.toLowerCase().includes(searchTerm)
            );
            
            if (!found) {
                // מנסים לתת למשתמש רמזים אם לא מצאנו
                const suggestions = tracks
                    .filter(t => t.name.toLowerCase().startsWith(searchTerm[0]))
                    .map(t => t.name)
                    .slice(0, 3);
                
                let msg = `לא מצאתי שיר בשם "${args.song_name}".`;
                if (suggestions.length > 0) msg += ` אולי התכוונת ל: ${suggestions.join(', ')}?`;
                return msg;
            }

            try {
                const audioBuffer = fs.readFileSync(found.fullPath);
                await sock.sendMessage(mainGroupId, { 
                    audio: audioBuffer, 
                    mimetype: 'audio/mp4', 
                    ptt: true 
                });
                return `✅ שלחתי את **${found.name}** לקבוצה.`;
            } catch (err) {
                return "שגיאה בשליחת הקובץ.";
            }
        }
    }
};