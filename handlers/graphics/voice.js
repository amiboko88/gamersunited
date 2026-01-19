const core = require('./core');

class VoiceRenderer {

    /**
     * מייצר תמונה מעוצבת של "שידור חי" עם האווטרים של המשתמשים
     */
    async generateCard(channelName, members) {
        // We want to DISPLAY emojis, not strip them. PFP sync logic ensures names are safe.
        const SafeChannelName = channelName.trim() || "Voice Channel";

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
                    background: radial-gradient(circle at top right, #2b2d42 0%, #0d0d11 75%);
                    font-family: 'Outfit', 'Noto Color Emoji', 'Segoe UI Emoji', sans-serif;
                    color: white;
                    display: flex; flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    padding-top: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 24px;
                    position: relative;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
                    overflow: hidden;
                }

                /* Glass Effect Overlay */
                .card::before {
                    content: '';
                    position: absolute;
                    top: -50%; left: -50%;
                    width: 200%; height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 60%);
                    pointer-events: none;
                }
                
                .live-badge {
                    position: absolute;
                    top: 25px;
                    background: linear-gradient(90deg, #ff0044, #ff4444);
                    color: white;
                    padding: 6px 16px;
                    border-radius: 20px;
                    font-weight: 800;
                    font-size: 13px;
                    box-shadow: 0 0 20px rgba(255, 0, 68, 0.4);
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    display: flex; align-items: center; gap: 8px;
                    z-index: 2;
                }
                .live-dot {
                    width: 8px; height: 8px; background: white; border-radius: 50%;
                    animation: pulse 1.5s infinite;
                }
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }

                .channel-name {
                    font-size: 38px;
                    font-weight: 900;
                    margin-top: 35px;
                    margin-bottom: 40px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #fff;
                    text-shadow: 0 0 30px rgba(255,255,255,0.1);
                    text-align: center;
                    max-width: 85%;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    z-index: 2;
                }
                
                .users-grid {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 25px;
                    width: 90%;
                    max-height: 250px;
                    z-index: 2;
                }

                .avatar-wrapper {
                    display: flex; flex-direction: column; align-items: center;
                    width: 85px;
                    opacity: 0;
                    animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
                }
                .avatar-wrapper:nth-child(1) { animation-delay: 0.1s; }
                .avatar-wrapper:nth-child(2) { animation-delay: 0.15s; }
                .avatar-wrapper:nth-child(3) { animation-delay: 0.2s; }
                .avatar-wrapper:nth-child(4) { animation-delay: 0.25s; }
                
                @keyframes popIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }

                .avatar {
                    width: 75px; height: 75px;
                    border-radius: 50%;
                    border: 3px solid #4CAF50;
                    object-fit: cover;
                    background: #222;
                    box-shadow: 0 8px 20px rgba(0,0,0,0.4);
                    transition: transform 0.2s;
                }
                
                .name {
                    margin-top: 10px;
                    font-size: 14px;
                    font-weight: 600;
                    color: rgba(255,255,255,0.9);
                    text-align: center;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                }

                .extra-count {
                    width: 75px; height: 75px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.1);
                    border: 2px dashed rgba(255,255,255,0.3);
                    display: flex; align-items: center; justify-content: center;
                    font-size: 22px;
                    font-weight: 800;
                    color: #aaa;
                    backdrop-filter: blur(5px);
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="live-badge"><div class="live-dot"></div>LIVE NOW</div>
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