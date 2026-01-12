// 📁 handlers/graphics/birthday.js
const core = require('./core');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../../assets');

class BirthdayRenderer {

    async generateCard(userData) {
        const displayName = userData.identity?.displayName || 'Gamer';
        const age = userData.identity?.birthday?.age || '?';
        const avatarUrl = userData.identity?.avatarURL || 'https://cdn.discordapp.com/embed/avatars/0.png';
        
        // נתונים
        const balance = userData.economy?.balance || 0;
        const xp = userData.economy?.xp || 0;
        const level = Math.floor(0.1 * Math.sqrt(xp)) || 1;
        const voiceHours = Math.floor((userData.stats?.voiceMinutes || 0) / 60);

        // חישוב ותק
        const joinedAtStr = userData.tracking?.joinedAt;
        const currentYear = new Date().getFullYear();
        let joinYear = currentYear;
        if (joinedAtStr) {
            joinYear = new Date(joinedAtStr).getFullYear();
        }
        const yearsInCommunity = currentYear - joinYear;
        const tenureText = yearsInCommunity > 0 ? `${yearsInCommunity} Years` : 'Newbie';
        const tenureDisplay = yearsInCommunity > 0 ? `${tenureText}` : `${joinYear}`;
        const tenureLabel = yearsInCommunity > 0 ? 'Seniority' : 'Joined';

        // טעינת תמונת רקע (אם קיימת)
        const bgPath = path.join(ASSETS_DIR, 'war_bg.png');
        let bgBase64 = '';
        if (fs.existsSync(bgPath)) {
            bgBase64 = fs.readFileSync(bgPath, 'base64');
        }

        const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head>
            <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700;900&display=swap" rel="stylesheet">
            <style>
                body { margin: 0; padding: 0; width: 800px; height: 400px; background: #111; font-family: 'Heebo', sans-serif; overflow: hidden; display: flex; align-items: center; justify-content: center; position: relative; color: white; }
                .bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: url('data:image/png;base64,${bgBase64}') no-repeat center/cover; opacity: 0.3; z-index: 1; }
                .card { position: relative; z-index: 10; display: flex; width: 90%; height: 80%; background: rgba(0,0,0,0.6); border-radius: 20px; border: 2px solid rgba(255,255,255,0.1); box-shadow: 0 10px 40px rgba(0,0,0,0.5); backdrop-filter: blur(10px); padding: 20px; box-sizing: border-box; }
                .info { flex: 2; display: flex; flex-direction: column; justify-content: center; padding-left: 20px; }
                .title { font-size: 42px; font-weight: 900; color: #fbbf24; text-shadow: 0 0 20px rgba(251, 191, 36, 0.4); margin: 0; line-height: 1; }
                .subtitle { font-size: 20px; margin-top: 5px; color: #ccc; }
                .stats { display: flex; gap: 15px; margin-top: 30px; }
                .stat-badge { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 8px 15px; border-radius: 8px; text-align: center; }
                .stat-val { font-size: 20px; font-weight: bold; color: #fff; }
                .stat-lbl { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
                .visual { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; }
                .avatar-ring { width: 160px; height: 160px; border-radius: 50%; padding: 5px; background: linear-gradient(45deg, #fbbf24, #f59e0b); position: relative; }
                .avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 4px solid #111; }
                .age-tag { position: absolute; bottom: 0; right: 20px; background: #ef4444; color: white; font-size: 24px; font-weight: bold; padding: 5px 15px; border-radius: 20px; transform: rotate(-10deg); border: 3px solid #111; box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
            </style>
        </head>
        <body>
            <div class="bg"></div>
            <div class="card">
                <div class="info">
                    <div class="title">יום הולדת שמח!</div>
                    <div class="subtitle">המון מזל טוב ל-${displayName}</div>
                    <div class="stats">
                        <div class="stat-badge"><div class="stat-val">LVL ${level}</div><div class="stat-lbl">Rank</div></div>
                        <div class="stat-badge"><div class="stat-val">₪${balance.toLocaleString()}</div><div class="stat-lbl">Balance</div></div>
                        <div class="stat-badge"><div class="stat-val">${voiceHours}h</div><div class="stat-lbl">Voice Time</div></div>
                        <div class="stat-badge" style="border-color: #3b82f6;"><div class="stat-val">${tenureDisplay}</div><div class="stat-lbl">${tenureLabel}</div></div>
                    </div>
                </div>
                <div class="visual">
                    <div class="avatar-ring">
                        <img src="${avatarUrl}" class="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    </div>
                    <div class="age-tag">${age}</div>
                </div>
            </div>
        </body>
        </html>`;

        // שימוש במנוע הליבה
        return core.render(html, 800, 400);
    }
}

module.exports = new BirthdayRenderer();