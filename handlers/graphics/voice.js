// 📁 handlers/graphics/voice.js
const core = require('./core');

class VoiceRenderer {

    /**
     * מייצר תמונה מעוצבת של "שידור חי" עם האווטרים של המשתמשים
     */
    async generateCard(channelName, members) {
        // יצירת ה-HTML של האווטרים
        const avatarsHtml = members.map(m => `
            <div class="avatar-wrapper">
                <img src="${m.user.displayAvatarURL({ extension: 'png', size: 128 })}" class="avatar" />
                <div class="name">${m.displayName}</div>
            </div>
        `).join('');

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;900&display=swap');
                body {
                    margin: 0; padding: 0;
                    width: 600px; height: 300px;
                    background: linear-gradient(135deg, #1e1e1e, #111);
                    font-family: 'Heebo', sans-serif;
                    color: white;
                    display: flex; flex-direction: column;
                    justify-content: center; align-items: center;
                    border: 4px solid #5865F2; /* Discord Color */
                    border-radius: 20px;
                }
                .status-badge {
                    background: #FF4444;
                    color: white;
                    padding: 5px 15px;
                    border-radius: 50px;
                    font-weight: 900;
                    font-size: 14px;
                    margin-bottom: 15px;
                    box-shadow: 0 0 15px rgba(255, 68, 68, 0.6);
                    animation: pulse 2s infinite;
                }
                .channel-name {
                    font-size: 32px;
                    font-weight: 900;
                    margin-bottom: 20px;
                    text-transform: uppercase;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.5);
                }
                .users-container {
                    display: flex;
                    gap: 15px;
                }
                .avatar-wrapper {
                    display: flex; flex-direction: column; align-items: center;
                }
                .avatar {
                    width: 70px; height: 70px;
                    border-radius: 50%;
                    border: 3px solid #25D366; /* WhatsApp Green hint */
                    object-fit: cover;
                }
                .name {
                    margin-top: 5px;
                    font-size: 14px;
                    color: #ccc;
                    max-width: 80px;
                    text-overflow: ellipsis;
                    overflow: hidden;
                    white-space: nowrap;
                }
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.7; }
                    100% { opacity: 1; }
                }
            </style>
        </head>
        <body>
            <div class="status-badge">● LIVE NOW</div>
            <div class="channel-name">🔊 ${channelName}</div>
            <div class="users-container">
                ${avatarsHtml}
            </div>
        </body>
        </html>`;

        // שימוש במנוע הליבה (Core)
        return core.render(html, 600, 300);
    }
}

module.exports = new VoiceRenderer();