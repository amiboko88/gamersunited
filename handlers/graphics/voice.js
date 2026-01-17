const core = require('./core');

class VoiceRenderer {

    /**
     * מייצר תמונה מעוצבת של "שידור חי" עם האווטרים של המשתמשים
     */
    async generateCard(channelName, members) {
        // ניקוי אימוג'ים משם הערוץ כדי למנוע קוביות
        const safeChannelName = channelName.replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{S}\p{M}^$\n]/gu, '').trim() || "Voice Channel";

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
            <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;900&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; }
                body, html {
                    margin: 0; padding: 0;
                    width: 100%; height: 100%;
                    overflow: hidden;
                    background: transparent;
                }
                .card {
                    width: 800px; height: 450px; /* קצת יותר גבוה ל-2 שורות */
                    background: linear-gradient(135deg, #121212, #1a1a1a);
                    font-family: 'Heebo', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif;
                    color: white;
                    display: flex; flex-direction: column;
                    align-items: center; /* Center horizontally */
                    padding-top: 40px;
                    border: 4px solid #5865F2;
                    border-radius: 30px;
                    position: relative;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.8);
                }
                
                .live-badge {
                    position: absolute;
                    top: 20px;
                    background: #FF0000;
                    color: white;
                    padding: 4px 15px;
                    border-radius: 15px;
                    font-weight: 900;
                    font-size: 14px;
                    box-shadow: 0 0 15px rgba(255, 0, 0, 0.6);
                    letter-spacing: 1px;
                }

                .channel-name {
                    font-size: 42px;
                    font-weight: 900;
                    margin-top: 10px;
                    margin-bottom: 30px;
                    text-transform: uppercase;
                    color: #fff;
                    text-shadow: 0 4px 10px rgba(0,0,0,0.5);
                    text-align: center;
                    max-width: 90%;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .users-grid {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 20px;
                    width: 90%;
                    max-height: 250px;
                }

                .avatar-wrapper {
                    display: flex; flex-direction: column; align-items: center;
                    width: 90px;
                }

                .avatar {
                    width: 80px; height: 80px;
                    border-radius: 50%;
                    border: 3px solid #4CAF50;
                    object-fit: cover;
                    background: #333;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.5);
                }
                
                .name {
                    margin-top: 8px;
                    font-size: 13px;
                    font-weight: bold;
                    color: #ccc;
                    text-align: center;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .extra-count {
                    width: 80px; height: 80px;
                    border-radius: 50%;
                    background: #5865F2;
                    border: 3px solid #fff;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 24px;
                    font-weight: 900;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="live-badge">🔴 LIVE NOW</div>
                <div class="channel-name">🔊 ${safeChannelName}</div>
                
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