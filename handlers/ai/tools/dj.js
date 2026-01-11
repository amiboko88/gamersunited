// 📁 handlers/ai/tools/dj.js
const audioManager = require('../../audio/manager');
const audioScanner = require('../../audio/scanner');

module.exports = {
    definition: {
        type: "function",
        function: {
            name: "dj_control",
            description: "Play music or sound effects in Discord. Use when user asks for a song.",
            parameters: {
                type: "object",
                properties: {
                    action: { type: "string", enum: ["play", "list"] },
                    song_name: { type: "string", description: "Name of the song/effect" }
                },
                required: ["action"]
            }
        }
    },

    async execute(args) {
        if (args.action === 'list') {
            const tracks = audioScanner.getTracks();
            return `🎶 **פלייליסט:**\n` + tracks.slice(0, 15).map(t => `- ${t.name}`).join('\n');
        }

        if (args.action === 'play') {
            const tracks = audioScanner.getTracks();
            const found = tracks.find(t => t.name.includes(args.song_name) || t.filename.includes(args.song_name));
            
            if (!found) return `לא מצאתי את "${args.song_name}".`;
            
            const res = await audioManager.playTrack(found.path, found.name);
            if (res === "NotConnected") return "אני לא מחובר לדיסקורד. כנסו לערוץ קודם.";
            
            return `✅ מנגן: ${found.name}`;
        }
    }
};