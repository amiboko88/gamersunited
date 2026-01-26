const core = require('./core');

class VoiceRenderer {

    /**
     * Helper: Convert "Fancy" Unicode (Math Bold/Italic) to standard ASCII
     * Solves the "Squares" issue when users name channels "𝗕𝗙𝟲" etc.
     */
    normalizeFancyText(text) {
        if (!text) return "";
        return text
            .normalize("NFKD")
            // Replace Mathematical Bold/Italic/Monospace ranges with ASCII
            .replace(/[\u{1D400}-\u{1D7FF}]/gu, (char) => {
                const code = char.codePointAt(0);
                // Bold A-Z
                if (code >= 0x1D400 && code <= 0x1D419) return String.fromCharCode(code - 0x1D400 + 65);
                // Bold a-z
                if (code >= 0x1D41A && code <= 0x1D433) return String.fromCharCode(code - 0x1D41A + 97);
                // Sans-Bold A-Z (The ones used in 𝗕𝗙𝟲)
                if (code >= 0x1D5D4 && code <= 0x1D5ED) return String.fromCharCode(code - 0x1D5D4 + 65);
                // Sans-Bold a-z
                if (code >= 0x1D5EE && code <= 0x1D607) return String.fromCharCode(code - 0x1D5EE + 97);
                // Bold Digits 0-9
                if (code >= 0x1D7CE && code <= 0x1D7D7) return String.fromCharCode(code - 0x1D7CE + 48);
                // Sans-Bold Digits 0-9
                if (code >= 0x1D7EC && code <= 0x1D7F5) return String.fromCharCode(code - 0x1D7EC + 48);

                return char;
            })
            .replace(/・/g, " • ") // Fix the "Small Circle" layout disruptor
            .replace(/\|/g, " | "); // Ensure pipes are spaced
    }

    /**
     * מייצר תמונה מעוצבת של "שידור חי" עם האווטרים של המשתמשים
     */
    async generateCard(channelName, members) {
        // Normalize the name to kill the squares
        const cleanName = this.normalizeFancyText(channelName);
        const SafeChannelName = cleanName.trim() || "Voice Channel";

        // לוגיקה לאווטרים: אם יש מעל 5, נחלק לשורות (עד 10)
        // אם יש המון, נציג 8 ופלוס
        let displayMembers = members;
        let extraCount = 0;

        if (members.length > 10) {
            displayMembers = members.slice(0, 9);
            extraCount = members.length - 9;
        }

        const avatarsHtml = displayMembers.map(m => `
            <div class="avatar-wrapper">
                <img src="${m.user.displayAvatarURL({ extension: 'png', size: 256 })}" class="avatar" />
                <div class="name">${m.displayName}</div>
            </div>
        `).join('');

        const extraHtml = extraCount > 0 ? `<div class="extra-count">+${extraCount}</div>` : '';

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; }
                body, html {
                    margin: 0; padding: 0;
                    width: 100%; height: 100%;
                    overflow: hidden;
                    background: transparent;
                }
                .card {
                    width: 800px; height: 450px;
                    background: radial-gradient(circle at center, #1a1a2e 0%, #000000 90%);
                    font-family: 'Outfit', 'Noto Color Emoji', 'Segoe UI Emoji', sans-serif;
                    color: white;
                    display: flex; flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    padding-top: 40px;
                    position: relative;
                    overflow: hidden;
                    /* No Border Radius as requested */
                }

                /* Subtle background grid/noise for premium feel */
                .card::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background-image: 
                        linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
                    background-size: 40px 40px;
                    opacity: 0.3;
                    pointer-events: none;
                }
                
                .live-badge {
                    background: #ff0044;
                    color: white;
                    padding: 8px 24px;
                    border-radius: 40px; /* Badge stays rounded */
                    font-weight: 900;
                    font-size: 16px;
                    box-shadow: 0 0 30px rgba(255, 0, 68, 0.6);
                    text-transform: uppercase;
                    letter-spacing: 3px;
                    margin-bottom: 20px;
                    z-index: 2;
                }

                .channel-name {
                    font-size: 64px; /* BIGGER */
                    font-weight: 900;
                    margin-bottom: 50px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: #fff;
                    text-shadow: 0 0 40px rgba(255,255,255,0.2);
                    text-align: center;
                    max-width: 90%;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    z-index: 2;
                    display: flex; align-items: center; justify-content: center; gap: 15px;
                }
                
                .users-grid {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 30px;
                    width: 90%;
                    z-index: 2;
                }

                .avatar-wrapper {
                    display: flex; flex-direction: column; align-items: center;
                    width: 100px; /* Slightly wider */
                }

                .avatar {
                    width: 85px; height: 85px; /* Bigger Avatars */
                    border-radius: 50%;
                    border: 3px solid #00e676; /* Green ring */
                    object-fit: cover;
                    background: #222;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                }
                
                .name {
                    margin-top: 12px;
                    font-size: 16px;
                    font-weight: 700;
                    color: #ddd;
                    text-align: center;
                    width: 100%;
                }

                .extra-count {
                    width: 85px; height: 85px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.1);
                    border: 2px dashed rgba(255,255,255,0.3);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 28px;
                    font-weight: 800;
                    color: #aaa;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="live-badge">LIVE NOW</div>
                <div class="channel-name">${SafeChannelName}</div>
                
                <div class="users-grid">
                    ${avatarsHtml}
                    ${extraHtml}
                </div>
            </div>
        </body>
        </html>`;

        return core.render(html, 800, 450, false, 'jpeg');
    }
}

module.exports = new VoiceRenderer();