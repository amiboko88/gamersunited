// 📁 handlers/graphics/voice.js
const core = require('./core');

class VoiceRenderer {

    /**
     * מייצר תמונה מעוצבת של "שידור חי" עם האווטרים של המשתמשים
     */
    async generateCard(channelName, members) {
        // יצירת ה-HTML של האווטרים
        const avatarsHtml = members.slice(0, 5).map(m => `
            <div class="avatar-wrapper">
                <img src="${m.user.displayAvatarURL({ extension: 'png', size: 256 })}" class="avatar" />
                <div class="name">${m.displayName}</div>
            </div>
        `).join('');

        const extraCount = members.length > 5 ? `+${members.length - 5}` : '';
        const extraHtml = extraCount ? `<div class="extra-count">${extraCount}</div>` : '';

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;900&display=swap');
                * { box-sizing: border-box; }
                body, html {
                    margin: 0; padding: 0;
                    width: 100%; height: 100%;
                    overflow: hidden;
                    background: transparent;
                }
                .card {
                    width: 800px; height: 400px;
                    background: linear-gradient(135deg, #121212, #2a2a2a);
                    font-family: 'Heebo', sans-serif;
                    color: white;
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    border: 6px solid #5865F2; /* Discord Blurple */
                    border-radius: 30px;
                    position: relative;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.8);
                }
                /* Background pattern */
                .card::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-image: radial-gradient(#ffffff 1px, transparent 1px);
                    background-size: 20px 20px;
                    opacity: 0.05;
                }
                
                .header {
                    text-align: center;
                    z-index: 2;
                    margin-bottom: 30px;
                }
                .live-badge {
                    background: #FF0000;
                    color: white;
                    padding: 5px 20px;
                    border-radius: 20px;
                    font-weight: 900;
                    font-size: 16px;
                    display: inline-block;
                    margin-bottom: 10px;
                    box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
                    animation: pulse 1.5s infinite;
                }
                .channel-name {
                    font-size: 48px;
                    font-weight: 900;
                    text-transform: uppercase;
                    background: -webkit-linear-gradient(#fff, #aaa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    filter: drop-shadow(0 4px 0 rgba(0,0,0,0.5));
                }
                
                .users-row {
                    display: flex;
                    gap: 20px;
                    z-index: 2;
                    align-items: center;
                }
                .avatar-wrapper {
                    display: flex; flex-direction: column; align-items: center;
                    position: relative;
                }
                .avatar {
                    width: 100px; height: 100px;
                    border-radius: 50%;
                    border: 4px solid #4CAF50;
                    object-fit: cover;
                    background: #333;
                    box-shadow: 0 10px 20px rgba(0,0,0,0.5);
                }
                .name {
                    margin-top: 10px;
                    font-size: 16px;
                    font-weight: bold;
                    color: #ddd;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.8);
                }
                .extra-count {
                    width: 60px; height: 60px;
                    background: #5865F2;
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 24px;
                    font-weight: 900;
                    border: 4px solid #fff;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                }

                .footer-invite {
                    position: absolute;
                    bottom: 20px;
                    font-size: 18px;
                    color: #aaa;
                    font-weight: 400;
                    background: rgba(0,0,0,0.3);
                    padding: 5px 20px;
                    border-radius: 50px;
                }

                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.05); opacity: 0.8; }
                    100% { transform: scale(1); opacity: 1; }
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="header">
                    <div class="live-badge">🔴 LIVE NOW</div>
                    <div class="channel-name">🔊 ${channelName}</div>
                </div>
                
                <div class="users-row">
                    ${avatarsHtml}
                    ${extraHtml}
                </div>

                <div class="footer-invite">🔥 מחכים לכם בדיסקורד! כנסו עכשיו</div>
            </div>
        </body>
        </html>`;

        return core.render(html, 800, 400); // רזולוציה גבוהה יותר
    }
}

module.exports = new VoiceRenderer();